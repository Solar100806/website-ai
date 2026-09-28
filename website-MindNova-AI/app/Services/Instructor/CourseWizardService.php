<?php

namespace App\Services\Instructor;

use App\Models\Course;
use App\Models\User;
use App\Models\LessonMedia;
use App\Services\Instructor\CourseService;
use App\Services\Instructor\CourseModuleService;
use App\Services\Instructor\LessonService;
use App\Services\Instructor\QuizService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Exception;
use Illuminate\Support\Facades\Log;

class CourseWizardService
{
    public function __construct(
        private readonly CourseService $courseService,
        private readonly CourseModuleService $moduleService,
        private readonly LessonService $lessonService,
        private readonly QuizService $quizService
    ) {}

    public function create(User $teacher, array $data, string $idempotencyKey): Course
    {
        $cacheKey = "course_wizard_idempotency_{$idempotencyKey}_{$teacher->id}";
        
        $existingCourseId = Cache::get($cacheKey);
        if ($existingCourseId) {
            $course = Course::find($existingCourseId);
            if ($course) {
                return $course;
            }
        }

        return DB::transaction(function () use ($teacher, $data, $cacheKey) {
            try {
                // 1. Create Course
                $courseData = [
                    'title' => $data['title'],
                    'description' => $data['description'],
                    'level' => $data['level'],
                    'category_id' => $data['category_id'] ?? null,
                    'price' => $data['price'],
                    'partnership_tier' => $data['partnership_tier'],
                ];
                
                if (isset($data['flash_sale']) && !empty($data['flash_sale'])) {
                    $courseData['is_flash_sale'] = true;
                    $courseData['sale_price'] = $data['flash_sale']['sale_price'];
                    $courseData['sale_start_date'] = $data['flash_sale']['start'];
                    $courseData['sale_end_date'] = $data['flash_sale']['end'];
                }

                $course = $this->courseService->createCourse($courseData, $teacher->id);

                // Process Thumbnail from temp media
                if (!empty($data['thumbnail_media_id'])) {
                    $media = LessonMedia::where('id', $data['thumbnail_media_id'])
                        ->where('uploaded_by', $teacher->id)
                        ->where('is_temp', true)
                        ->first();
                        
                    if ($media) {
                        $course->update(['thumbnail' => Storage::disk('r2')->url($media->r2_key)]);
                        $media->update(['is_temp' => false]);
                    } else {
                        throw new Exception("Media tạm không hợp lệ hoặc không thuộc về bạn.");
                    }
                }

                // 2. Create Modules & Lessons & Quizzes
                foreach ($data['modules'] as $moduleData) {
                    $module = $this->moduleService->createModule($course, [
                        'title' => $moduleData['title'],
                        'order' => $moduleData['order'],
                    ]);

                    foreach ($moduleData['lessons'] as $lessonData) {
                        $lessonType = $lessonData['type'];
                        
                        $payload = [
                            'title' => $lessonData['title'],
                            'type' => $lessonType,
                            'order' => $lessonData['order'],
                            'content' => $lessonData['content'] ?? null,
                            'temp_media_ids' => $lessonData['temp_media_ids'] ?? [],
                            'video_url' => $lessonData['video_url'] ?? null,
                        ];

                        $lesson = $this->lessonService->createLesson($module, $payload);

                        // Attach Quiz if it's a quiz module
                        if (in_array($lessonType, ['quiz', 'quiz_module']) && !empty($lessonData['quiz'])) {
                            $this->quizService->createOrUpdateQuiz($lesson, $lessonData['quiz']);
                        }
                    }
                }

                Cache::put($cacheKey, $course->id, now()->addDays(1));

                return $course;
            } catch (Exception $e) {
                Log::error('CourseWizardService Error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
                throw $e;
            }
        });
    }
}
