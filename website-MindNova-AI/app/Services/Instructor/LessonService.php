<?php

namespace App\Services\Instructor;

use App\Models\ContentVersion;
use App\Models\CourseModule;
use App\Models\DeletionRequest;
use App\Models\Lesson;
use App\Models\LessonAttachment;
use App\Models\LessonMedia;
use App\Services\ContentAuditService;
use App\Services\ContentReviewService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class LessonService
{
    public function __construct(
        private readonly ContentAuditService $auditService,
        private readonly ContentReviewService $reviewService,
        private readonly QuizMediaService $quizMediaService,
    ) {}

    public function createLesson(CourseModule $module, array $data): Lesson
    {
        $data['module_id'] = $module->id;
        $data['course_id'] = $module->course_id;
        if (!isset($data['order'])) {
            $maxOrder = $module->lessons()->max('order') ?? 0;
            $data['order'] = $maxOrder + 1;
        }

        // ── RULE 4: New lessons ALWAYS start as draft ──
        $data['status'] = 'draft';
        $data['current_version'] = 1;

        if ($data['type'] === 'article' && isset($data['content'])) {
            $content = $data['content'] ?? '';
            $text = strip_tags($content);
            $wordCount = count(preg_split('~[^\p{L}\p{N}\']+~u', $text, -1, PREG_SPLIT_NO_EMPTY));
            $imageCount = substr_count($content, '<img ');
            $data['duration_seconds'] = (int) ceil(($wordCount / 200) * 60) + ($imageCount * 10);
        } elseif ($data['type'] === 'quiz_module' && isset($data['quizData']['time_limit_minutes'])) {
            $data['duration_seconds'] = (int) $data['quizData']['time_limit_minutes'] * 60;
        }

        $lesson = Lesson::create($data);

        // Save Quiz Data if present
        if ($lesson->type === 'quiz_module' && isset($data['quizData'])) {
            $this->saveQuizData($lesson, $data['quizData']);
        }

        // Mark pending submissions as stale if course is published
        $course = $module->course;
        if ($course && $course->isPublished()) {
            $this->reviewService->markSubmissionsStale($course);
        }

        return $lesson;
    }

    /**
     * Update a lesson with version awareness.
     *
     * RULE 5: If lesson is published, teacher edits go to the working copy
     * but published_version_id stays the same — students see old version.
     */
    public function updateLesson(Lesson $lesson, array $data): Lesson
    {
        // ── RULE 3: Cannot directly modify published version's snapshot ──
        // The teacher edits the live lesson record (working draft),
        // but the published snapshot in content_versions remains unchanged.
        // Students always read from the published_version's snapshot_data.

        $lesson->fill($data);

        if ($lesson->type === 'article') {
            $content = $lesson->content ?? '';
            $text = strip_tags($content);
            $wordCount = count(preg_split('~[^\p{L}\p{N}\']+~u', $text, -1, PREG_SPLIT_NO_EMPTY));
            $imageCount = substr_count($content, '<img ');
            $lesson->duration_seconds = (int) ceil(($wordCount / 200) * 60) + ($imageCount * 10);
        } elseif ($lesson->type === 'quiz_module' && isset($data['quizData']['time_limit_minutes'])) {
            $lesson->duration_seconds = (int) $data['quizData']['time_limit_minutes'] * 60;
        }

        // If lesson was published, mark it as having a draft revision
        // but keep the published_version_id so students see old version
        if ($lesson->isPublished() && $lesson->status === 'published') {
            // Change status to draft to indicate there's a working revision
            $lesson->status = 'draft';
        }

        $lesson->save();

        // Save Quiz Data if present
        if ($lesson->type === 'quiz_module' && isset($data['quizData'])) {
            $this->saveQuizData($lesson, $data['quizData']);
        }

        // Mark pending submissions as stale
        $course = $lesson->module?->course;
        if ($course) {
            $this->reviewService->markSubmissionsStale($course);
        }

        return $lesson;
    }

    /**
     * Delete a lesson with version awareness.
     *
     * RULE 9: If lesson is published, create deletion request instead.
     */
    public function deleteLesson(Lesson $lesson): void
    {
        if ($lesson->isPublished()) {
            throw new \Exception('Không thể xóa trực tiếp bài học đang public. Hãy tạo yêu cầu xóa.');
        }

        // Delete associated media from R2
        foreach ($lesson->media as $media) {
            Storage::disk('r2')->delete($media->r2_key);
        }

        foreach ($lesson->attachments as $attachment) {
            Storage::disk('r2')->delete($attachment->r2_key);
        }

        if ($lesson->quiz) {
            $this->quizMediaService->deleteKeys($this->quizMediaService->managedKeys($lesson->quiz));
        }

        $lesson->delete();
    }

    /**
     * @param array<int, UploadedFile> $files
     * @return array<int, LessonAttachment>
     */
    public function uploadAttachments(Lesson $lesson, array $files, int $uploaderId): array
    {
        $uploadedKeys = [];
        $attachments = [];

        try {
            foreach ($files as $file) {
                $extension = strtolower($file->getClientOriginalExtension());
                $key = "lessons/{$lesson->id}/attachments/".Str::uuid().".{$extension}";

                Storage::disk('r2')->putFileAs(
                    "lessons/{$lesson->id}/attachments",
                    $file,
                    basename($key),
                );
                $uploadedKeys[] = $key;

                $attachments[] = $lesson->attachments()->create([
                    'uploaded_by' => $uploaderId,
                    'display_name' => $file->getClientOriginalName(),
                    'original_name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getMimeType() ?: 'application/octet-stream',
                    'extension' => $extension,
                    'size_bytes' => $file->getSize(),
                    'r2_key' => $key,
                ]);
            }
        } catch (Throwable $exception) {
            Storage::disk('r2')->delete($uploadedKeys);
            foreach ($attachments as $attachment) {
                $attachment->delete();
            }

            throw $exception;
        }

        return $attachments;
    }

    public function renameAttachment(LessonAttachment $attachment, string $displayName): LessonAttachment
    {
        $attachment->update(['display_name' => trim($displayName)]);

        return $attachment->fresh();
    }

    public function deleteAttachment(LessonAttachment $attachment): void
    {
        Storage::disk('r2')->delete($attachment->r2_key);
        $attachment->delete();
    }

    public function attachmentDownloadUrl(LessonAttachment $attachment): array
    {
        $expiresAt = now()->addHour();

        return [
            'signed_url' => Storage::disk('r2')->temporaryUrl($attachment->r2_key, $expiresAt),
            'expires_at' => $expiresAt,
        ];
    }


    /**
     * Request deletion of a published lesson.
     */
    public function requestDeletion(Lesson $lesson, \App\Models\User $user, ?string $reason = null): DeletionRequest
    {
        return $this->reviewService->requestLessonDeletion($lesson, $user, $reason);
    }

    public function uploadVideo(Lesson $lesson, UploadedFile $file): array
    {
        $uuid = \Illuminate\Support\Str::uuid()->toString();
        $extension = $file->getClientOriginalExtension();
        $filename = "Courses/{$lesson->course_id}/Modules/{$lesson->module_id}/Lessons/{$lesson->id}/Videos/{$uuid}.{$extension}";

        // Upload to Cloudflare R2
        Storage::disk('r2')->put($filename, file_get_contents($file));

        $media = LessonMedia::create([
            'lesson_id' => $lesson->id,
            'media_type' => 'video',
            'r2_key' => $filename,
            'original_filename' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
            'status' => 'ready', // We can mark it ready immediately or use a queue for processing later
        ]);

        return [
            'media_id' => $media->id,
            'signed_url' => Storage::disk('r2')->temporaryUrl($filename, now()->addHours(1)),
            'status' => $media->status,
        ];
    }

    public function generateVideoUrl(Lesson $lesson): ?array
    {
        $media = $lesson->media()->where('media_type', 'video')->where('status', 'ready')->latest()->first();

        if (!$media) {
            return null;
        }

        $expiresAt = now()->addHours(1);
        $signedUrl = Storage::disk('r2')->temporaryUrl($media->r2_key, $expiresAt);

        return [
            'signed_url' => $signedUrl,
            'expires_at' => $expiresAt,
        ];
    }

    /**
     * Upload a media file from CKEditor content (image or video) to Cloudflare R2.
     * Returns the public URL for embedding in HTML content.
     */
    public function uploadContentMedia(Lesson $lesson, UploadedFile $file): array
    {
        $uuid = \Illuminate\Support\Str::uuid()->toString();
        $extension = $file->getClientOriginalExtension();

        $isVideo = str_starts_with($file->getMimeType(), 'video/');
        $subfolder = $isVideo ? 'Videos' : 'Images';
        $mediaType = $isVideo ? 'video' : 'image';

        $filename = "Courses/{$lesson->course_id}/Modules/{$lesson->module_id}/Lessons/{$lesson->id}/{$subfolder}/{$uuid}.{$extension}";

        // Upload to Cloudflare R2 securely without loading into memory
        Storage::disk('r2')->putFileAs(
            "Courses/{$lesson->course_id}/Modules/{$lesson->module_id}/Lessons/{$lesson->id}/{$subfolder}",
            $file,
            "{$uuid}.{$extension}"
        );

        $media = LessonMedia::create([
            'lesson_id' => $lesson->id,
            'media_type' => $mediaType,
            'r2_key' => $filename,
            'original_filename' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
            'status' => 'ready',
        ]);

        $url = Storage::disk('r2')->url($filename);
        $previewUrl = Storage::disk('r2')->temporaryUrl($filename, now()->addHour());

        return [
            'media_id' => $media->id,
            'url' => $url,
            'preview_url' => $previewUrl,
            'media_type' => $mediaType,
        ];
    }

    /**
     * Upload a temporary media file to Cloudflare R2.
     * Returns the public URL and media ID for CKEditor preview.
     */
    public function uploadTempMedia(UploadedFile $file): array
    {
        $uuid = \Illuminate\Support\Str::uuid()->toString();
        $extension = $file->getClientOriginalExtension();

        $isVideo = str_starts_with($file->getMimeType(), 'video/');
        $subfolder = $isVideo ? 'videos' : 'images';
        $mediaType = $isVideo ? 'video' : 'image';

        $durationSeconds = 0;
        if ($isVideo) {
            $getID3 = new \getID3();
            $fileInfo = $getID3->analyze($file->getPathname());
            if (isset($fileInfo['playtime_seconds'])) {
                $durationSeconds = round($fileInfo['playtime_seconds']);
            }
        }

        $filename = "temp/{$subfolder}/{$uuid}.{$extension}";

        if (!Storage::disk('r2')->putFileAs("temp/{$subfolder}", $file, "{$uuid}.{$extension}")) {
            throw new \RuntimeException('Không thể tải ảnh hoặc video lên. Vui lòng thử lại.');
        }

        $media = LessonMedia::create([
            'lesson_id' => null,
            'uploaded_by' => auth()->id(),
            'media_type' => $mediaType,
            'r2_key' => $filename,
            'original_filename' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
            'duration_seconds' => $durationSeconds,
            'status' => 'ready',
            'is_temp' => true,
        ]);

        $url = Storage::disk('r2')->url($filename);

        return [
            'media_id' => $media->id,
            'url' => $url,
            'media_type' => $mediaType,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
        ];
    }

    /**
     * Move temporary media to official lesson folder, mark as active, update lesson content URLs, and clean orphans.
     */
    public function confirmTempMedia(array $mediaIds, Lesson $lesson): void
    {
        $contentChanged = false;
        $content = $lesson->content ?? '';
        $videoUrl = $lesson->video_url ?? '';

        // A retry can submit the editor's original temporary URLs after some images
        // have already moved. Reconcile only media attached to this same lesson.
        if (!empty($mediaIds)) {
            $attached = LessonMedia::whereIn('id', $mediaIds)
                ->where('lesson_id', $lesson->id)->where('is_temp', false)->get();
            foreach ($attached as $media) {
                $folder = $media->media_type === 'video' ? 'videos' : 'images';
                $oldUrl = Storage::disk('r2')->url("temp/{$folder}/" . basename($media->r2_key));
                $newUrl = Storage::disk('r2')->url($media->r2_key);
                if (str_contains($content, $oldUrl)) {
                    $content = str_replace($oldUrl, $newUrl, $content);
                    $contentChanged = true;
                }
                if ($videoUrl === $oldUrl) {
                    $videoUrl = $newUrl;
                    $contentChanged = true;
                }
            }
            if ($contentChanged) {
                $lesson->content = $content;
                $lesson->video_url = $videoUrl;
                $lesson->save();
                $contentChanged = false;
            }
        }

        // 1. Move and update new media from temp folder
        if (!empty($mediaIds)) {
            $mediaList = LessonMedia::whereIn('id', $mediaIds)
                ->where('is_temp', true)
                ->get();

            foreach ($mediaList as $media) {
                $subfolder = $media->media_type === 'video' ? 'Videos' : 'Images';
                $filename = basename($media->r2_key);
                $newKey = "Courses/{$lesson->course_id}/Modules/{$lesson->module_id}/Lessons/{$lesson->id}/{$subfolder}/{$filename}";

                $oldUrl = Storage::disk('r2')->url($media->r2_key);
                $newUrl = Storage::disk('r2')->url($newKey);

                // Move the file in Cloudflare R2
                try {
                    if (!Storage::disk('r2')->move($media->r2_key, $newKey)) {
                        throw new \RuntimeException('Không thể lưu ảnh hoặc video vào bài học. Vui lòng thử lại.');
                    }
                } catch (\Exception $e) {
                    \Log::error("Failed to move temp media: " . $e->getMessage());
                    throw new \RuntimeException('Không thể lưu ảnh hoặc video vào bài học. Vui lòng thử lại.', 0, $e);
                }

                $media->update([
                    'lesson_id' => $lesson->id,
                    'r2_key' => $newKey,
                    'is_temp' => false,
                ]);

                // Replace old URL with new URL in content
                if (str_contains($content, $oldUrl)) {
                    $content = str_replace($oldUrl, $newUrl, $content);
                    $contentChanged = true;
                }

                // If media is video, set official R2 URL and UPLOAD TO GEMINI
                if ($media->media_type === 'video') {
                    $videoUrl = $newUrl;
                    $contentChanged = true;

                    // ==========================================
                    // 🚀 BẮT ĐẦU ĐỒNG BỘ VIDEO LÊN GEMINI API
                    // ==========================================
                    try {
                        $videoContent = Storage::disk('r2')->get($newKey);
                        $mimeType = 'video/mp4';

                        $response = \Illuminate\Support\Facades\Http::withHeaders([
                            'X-Goog-Upload-Protocol' => 'raw',
                            'X-Goog-Upload-Command' => 'upload, finalize',
                            'X-Goog-Upload-Header-Content-Length' => strlen($videoContent),
                            'X-Goog-Upload-Header-Content-Type' => $mimeType,
                        ])
                        ->timeout(300) // 🟢 THÊM DÒNG NÀY ĐỂ KÉO DÀI THỜI GIAN CHỜ LÊN 5 PHÚT
                        ->withBody($videoContent, $mimeType)
                        ->post('https://generativelanguage.googleapis.com/upload/v1beta/files?key=' . env('GEMINI_API_KEY'));

                        if ($response->successful()) {
                            $geminiData = $response->json();
                            $geminiFileUri = $geminiData['file']['uri'] ?? null;

                            // Lưu uri này vào DB để lát Frontend gọi
                            $lesson->gemini_file_uri = $geminiFileUri;
                            $contentChanged = true;

                            \Log::info("✅ [Gemini Sync] Thành công: " . $geminiFileUri);
                        } else {
                            \Log::error("❌ [Gemini Sync] Thất bại: " . $response->body());
                        }
                    } catch (\Exception $e) {
                        \Log::error("❌ [Gemini Sync] Lỗi cục bộ: " . $e->getMessage());
                    }
                    // ==========================================
                }

                if ($lesson->type === 'video' && $media->media_type === 'video' && $media->duration_seconds > 0) {
                    $lesson->duration_seconds = $media->duration_seconds;
                    $contentChanged = true;
                }

                // Keep completed URLs durable even if a later media move fails.
                if ($contentChanged || $lesson->isDirty()) {
                    $lesson->content = $content;
                    $lesson->video_url = $videoUrl;
                    $lesson->save();
                    $contentChanged = false;
                }
            }
        }

        // 2. Clean up orphaned media
        $existingMedia = $lesson->media()
            ->where('is_temp', false)
            ->whereNotIn('id', $mediaIds)
            ->get();

        foreach ($existingMedia as $media) {
            $mediaUrl = Storage::disk('r2')->url($media->r2_key);
            if (!str_contains($content, $mediaUrl) && !str_contains($videoUrl, $mediaUrl)) {
                Storage::disk('r2')->delete($media->r2_key);
                $media->delete();
            }
        }

        // Save lesson if content or video_url was updated with new URLs
        if ($contentChanged || $lesson->isDirty()) {
            $lesson->content = $content;
            $lesson->video_url = $videoUrl;
            $lesson->save();
        }
    }

    /**
     * Delete a temporary media file.
     */
    public function deleteTempMedia(int $mediaId): void
    {
        $media = LessonMedia::where('id', $mediaId)->where('is_temp', true)->first();

        if ($media) {
            Storage::disk('r2')->delete($media->r2_key);
            $media->delete();
        }
    }

    private function saveQuizData(Lesson $lesson, array $quizData): void
    {
        $questionsData = $quizData['questions'] ?? [];
        $mcCount = 0;
        $essayCount = 0;
        $totalPoints = 0.0;

        foreach ($questionsData as $q) {
            if (($q['type'] ?? 'multiple_choice') === 'essay') {
                $essayCount++;
            } else {
                $mcCount++;
            }
            $totalPoints += (float) ($q['points'] ?? 0.0);
        }

        $teacherId = auth()->id() ?? ($lesson->course->teacher_id ?? ($lesson->module->course->teacher_id ?? null));

        $targetQuizId = $quizData['quiz_id'] ?? ($quizData['id'] ?? null);
        $quiz = null;
        $existingQuiz = $targetQuizId && is_numeric($targetQuizId)
            ? \App\Models\Quiz::find((int) $targetQuizId)
            : \App\Models\Quiz::where('lesson_id', $lesson->id)->first();
        $oldManagedKeys = $existingQuiz ? $this->quizMediaService->managedKeys($existingQuiz) : [];

        if ($targetQuizId && is_numeric($targetQuizId)) {
            $foundQuiz = \App\Models\Quiz::find((int) $targetQuizId);
            if ($foundQuiz) {
                $foundQuiz->update([
                    'lesson_id' => $lesson->id,
                    'instructor_id' => $teacherId ?? $foundQuiz->instructor_id,
                    'title' => $quizData['title'] ?? $foundQuiz->title,
                    'description' => $quizData['description'] ?? $foundQuiz->description,
                    'thumbnail_url' => array_key_exists('thumbnail_url', $quizData) ? $quizData['thumbnail_url'] : $foundQuiz->thumbnail_url,
                    'thumbnail_r2_key' => array_key_exists('thumbnail_r2_key', $quizData) ? $quizData['thumbnail_r2_key'] : $foundQuiz->thumbnail_r2_key,
                    'time_limit_minutes' => $quizData['time_limit_minutes'] ?? $foundQuiz->time_limit_minutes ?? 15,
                    'passing_score' => $quizData['passing_score'] ?? $foundQuiz->passing_score ?? 70,
                    'difficulty' => $quizData['difficulty'] ?? $foundQuiz->difficulty ?? 'mixed',
                    'total_questions' => count($questionsData),
                    'mc_questions_count' => $mcCount,
                    'essay_questions_count' => $essayCount,
                    'total_points' => round($totalPoints, 2),
                ]);
                $quiz = $foundQuiz;
            }
        }

        if (!$quiz) {
            $quiz = \App\Models\Quiz::updateOrCreate(
                ['lesson_id' => $lesson->id],
                [
                    'instructor_id' => $teacherId,
                    'title' => $quizData['title'] ?? 'Bài kiểm tra',
                    'description' => $quizData['description'] ?? null,
                    'thumbnail_url' => $quizData['thumbnail_url'] ?? null,
                    'thumbnail_r2_key' => $quizData['thumbnail_r2_key'] ?? null,
                    'time_limit_minutes' => $quizData['time_limit_minutes'] ?? 15,
                    'passing_score' => $quizData['passing_score'] ?? 70,
                    'difficulty' => $quizData['difficulty'] ?? 'mixed',
                    'total_questions' => count($questionsData),
                    'mc_questions_count' => $mcCount,
                    'essay_questions_count' => $essayCount,
                    'total_points' => round($totalPoints, 2),
                ]
            );
        }

        $instructor = auth()->user() ?? \App\Models\User::findOrFail($teacherId);
        $promotion = $this->quizMediaService->promotePayload($instructor, $quiz, $quizData);
        $quizData = $promotion['data'];
        $questionsData = $quizData['questions'] ?? [];
        $quiz->update([
            'thumbnail_url' => $quizData['thumbnail_url'] ?? null,
            'thumbnail_r2_key' => $quizData['thumbnail_r2_key'] ?? null,
        ]);

        $courseId = $lesson->course_id ?? ($lesson->module->course_id ?? null);
        if ($courseId) {
            \App\Models\QuizCourseAttachment::updateOrCreate(
                ['quiz_id' => $quiz->id],
                [
                    'course_id' => $courseId,
                    'module_id' => $lesson->module_id,
                    'after_lesson_id' => $lesson->id,
                    'position' => 'after_lesson',
                ]
            );
        }

        if (!empty($questionsData)) {
            $quiz->questions()->delete();

            foreach ($questionsData as $index => $qData) {
                $type = $qData['type'] ?? 'multiple_choice';
                if ($type === 'tu_luan') $type = 'essay';
                if ($type === 'trac_nghiem') $type = 'multiple_choice';
                $content = !empty($qData['question']) ? $qData['question'] : (!empty($qData['content']) ? $qData['content'] : 'Câu hỏi');

                $question = $quiz->questions()->create([
                    'type' => $type,
                    'selection_type' => $qData['selection_type'] ?? 'single_choice',
                    'content' => $content,
                    'image_url' => $qData['image_url'] ?? null,
                    'image_r2_key' => $qData['image_r2_key'] ?? null,
                    'explanation' => $qData['explanation'] ?? null,
                    'sample_answer' => $type === 'essay' ? ($qData['sample_answer'] ?? null) : null,
                    'rubric' => $type === 'essay' ? ($qData['rubric'] ?? null) : null,
                    'points' => (float) ($qData['points'] ?? ($type === 'essay' ? 5.0 : 1.0)),
                    'difficulty' => $qData['difficulty'] ?? 'medium',
                    'order' => $index + 1,
                ]);

                if ($type !== 'essay') {
                    $answersList = $qData['answers'] ?? [];

                    if (empty($answersList) && !empty($qData['options']) && is_array($qData['options'])) {
                        $correctIdx = is_numeric($qData['correct_answer_index'] ?? null) ? (int)$qData['correct_answer_index'] : 0;
                        $correctIndices = is_array($qData['correct_answer_indices'] ?? null) ? $qData['correct_answer_indices'] : [$correctIdx];
                        foreach ($qData['options'] as $optIdx => $optContent) {
                            $isCorrect = ($qData['selection_type'] ?? 'single_choice') === 'multiple_choice'
                                ? in_array($optIdx, $correctIndices, true)
                                : $optIdx === $correctIdx;
                            $answersList[] = [
                                'content' => (string) $optContent,
                                'is_correct' => $isCorrect,
                                'image_url' => $qData['answer_images'][$optIdx]['url'] ?? null,
                                'image_r2_key' => $qData['answer_images'][$optIdx]['r2_key'] ?? null,
                            ];
                        }
                    }

                    foreach ($answersList as $aData) {
                        $question->answers()->create([
                            'content' => $aData['content'] ?? $aData['answer'] ?? '',
                            'is_correct' => !empty($aData['is_correct']),
                            'image_url' => $aData['image_url'] ?? null,
                            'image_r2_key' => $aData['image_r2_key'] ?? null,
                        ]);
                    }
                }
            }
        }

        $currentKeys = $this->quizMediaService->managedKeys($quiz->fresh());
        $this->quizMediaService->deleteKeys(array_values(array_diff($oldManagedKeys, $currentKeys)));
    }
}
