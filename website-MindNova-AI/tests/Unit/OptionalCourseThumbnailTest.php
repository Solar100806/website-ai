<?php

namespace Tests\Unit;

use App\Http\Requests\Instructor\CourseWizardRequest;
use Illuminate\Validation\Factory;
use Illuminate\Translation\Translator;
use Illuminate\Translation\ArrayLoader;
use PHPUnit\Framework\TestCase;

class OptionalCourseThumbnailTest extends TestCase
{
    public function test_course_creation_accepts_an_omitted_or_null_thumbnail(): void
    {
        $payload = [
            'title' => 'Course without a cover',
            'description' => 'A sufficiently long course description for validation.',
            'other_category_name' => 'Mathematics',
            'level' => 'beginner',
            'price' => 100000,
            'partnership_tier' => 'standard',
            'modules' => [[
                'title' => 'First chapter', 'order' => 1,
                'lessons' => [['title' => 'First lesson', 'type' => 'article', 'order' => 1, 'content' => 'Lesson content']],
            ]],
        ];
        foreach ([$payload, $payload + ['thumbnail_media_id' => null]] as $input) {
            $validator = (new Factory(new Translator(new ArrayLoader(), "en")))->make($input, (new CourseWizardRequest())->rules());
            $this->assertTrue($validator->passes(), $validator->errors()->toJson());
        }
    }
}
