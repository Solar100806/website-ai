<?php

namespace Tests\Unit;

use App\Models\Course;
use App\Models\LessonMedia;
use App\Models\User;
use App\Services\Instructor\CourseModuleService;
use App\Services\Instructor\CourseService;
use App\Services\Instructor\CourseWizardService;
use App\Services\Instructor\LessonService;
use App\Services\Instructor\QuizService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class CourseCoverAttachmentTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:', 'cache.default' => 'array']);
        app('db')->purge('sqlite');
        Schema::create('lesson_media', function (Blueprint $table) {
            $table->id(); $table->unsignedBigInteger('lesson_id')->nullable(); $table->unsignedBigInteger('uploaded_by')->nullable();
            $table->string('media_type'); $table->string('r2_key'); $table->string('original_filename');
            $table->integer('file_size'); $table->string('mime_type'); $table->integer('duration_seconds')->default(0);
            $table->string('status'); $table->boolean('is_temp'); $table->timestamps();
        });
        Schema::create('courses', function (Blueprint $table) {
            $table->id(); $table->string('thumbnail')->nullable(); $table->timestamps();
        });
        Storage::fake('r2', ['url' => 'https://media.example.test']);
        $this->actingAs((new User())->forceFill(['id' => 42]));
    }

    public function test_uploaded_cover_belongs_to_uploader_and_attaches_to_course(): void
    {
        $upload = app(LessonService::class)->uploadTempMedia(UploadedFile::fake()->create('cover.png', 1, 'image/png'));
        $media = LessonMedia::findOrFail($upload['media_id']);
        $this->assertSame(42, (int) $media->uploaded_by);

        $course = Course::withoutEvents(fn () => Course::create([]));
        $courseService = Mockery::mock(CourseService::class);
        $courseService->shouldReceive('createCourse')->once()->andReturn($course);
        $wizard = new CourseWizardService($courseService, app(CourseModuleService::class), app(LessonService::class), app(QuizService::class));
        $wizard->create(auth()->user(), [
            'title' => 'Course', 'description' => 'Course description', 'level' => 'beginner', 'price' => 0,
            'partnership_tier' => 'standard', 'thumbnail_media_id' => $media->id, 'modules' => [],
        ], 'cover-attachment');
        $this->assertSame($upload['url'], $course->fresh()->thumbnail);
        $this->assertFalse($media->fresh()->is_temp);
    }
    public function test_course_creation_without_a_cover_keeps_thumbnail_null(): void
    {
        $course = Course::withoutEvents(fn () => Course::create([]));
        $courseService = Mockery::mock(CourseService::class);
        $courseService->shouldReceive('createCourse')->once()->andReturn($course);
        $wizard = new CourseWizardService($courseService, app(CourseModuleService::class), app(LessonService::class), app(QuizService::class));
        $created = $wizard->create(auth()->user(), [
            'title' => 'Course', 'description' => 'Course description', 'level' => 'beginner', 'price' => 0,
            'partnership_tier' => 'standard', 'modules' => [],
        ], 'without-cover');
        $this->assertSame($course->id, $created->id);
        $this->assertNull($created->fresh()->thumbnail);
    }

    public function test_another_teachers_cover_is_rejected(): void
    {
        $upload = app(LessonService::class)->uploadTempMedia(UploadedFile::fake()->create('cover.png', 1, 'image/png'));
        LessonMedia::findOrFail($upload['media_id'])->update(['uploaded_by' => 99]);
        $course = Course::withoutEvents(fn () => Course::create([]));
        $courseService = Mockery::mock(CourseService::class);
        $courseService->shouldReceive('createCourse')->once()->andReturn($course);
        $wizard = new CourseWizardService($courseService, app(CourseModuleService::class), app(LessonService::class), app(QuizService::class));
        $this->expectExceptionMessage('Media tạm không hợp lệ hoặc không thuộc về bạn.');
        $wizard->create(auth()->user(), [
            'title' => 'Course', 'description' => 'Course description', 'level' => 'beginner', 'price' => 0,
            'partnership_tier' => 'standard', 'thumbnail_media_id' => $upload['media_id'], 'modules' => [],
        ], 'other-cover');
    }

}
