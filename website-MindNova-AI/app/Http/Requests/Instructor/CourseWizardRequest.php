<?php

namespace App\Http\Requests\Instructor;

use Illuminate\Foundation\Http\FormRequest;

class CourseWizardRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => 'required|string|min:3|max:255',
            'description' => 'required|string|min:30',
            'category_id' => 'required_without:other_category_name|nullable|exists:categories,id',
            'other_category_name' => 'required_without:category_id|nullable|string|min:2|max:100',
            'level' => 'required|in:beginner,intermediate,advanced,all',
            'thumbnail_media_id' => 'nullable|exists:lesson_media,id',
            
            'price' => 'required|numeric|min:0|max:100000000',
            'partnership_tier' => 'required|in:standard,exclusive',
            
            'flash_sale' => 'nullable|array',
            'flash_sale.sale_price' => 'required_with:flash_sale|numeric|min:0|lt:price',
            'flash_sale.start' => 'required_with:flash_sale|date|after_or_equal:today',
            'flash_sale.end' => 'required_with:flash_sale|date|after:flash_sale.start',

            'modules' => 'required|array|min:1',
            'modules.*.title' => 'required|string|min:3|max:255',
            'modules.*.order' => 'required|integer|min:1',
            
            'modules.*.lessons' => 'required|array|min:1',
            'modules.*.lessons.*.title' => 'required|string|min:3|max:255',
            'modules.*.lessons.*.type' => 'required|in:video,article,quiz_module',
            'modules.*.lessons.*.order' => 'required|integer|min:1',
            'modules.*.lessons.*.content' => 'nullable|string',
            'modules.*.lessons.*.temp_media_ids' => 'nullable|array',
            'modules.*.lessons.*.temp_media_ids.*' => 'exists:lesson_media,id',
            'modules.*.lessons.*.video_url' => 'nullable|string',
            
            'modules.*.lessons.*.quiz' => 'nullable|array',
            'modules.*.lessons.*.quiz.title' => 'required_with:modules.*.lessons.*.quiz|string',
            'modules.*.lessons.*.quiz.time_limit_minutes' => 'nullable|integer|min:1',
            'modules.*.lessons.*.quiz.passing_score' => 'required_with:modules.*.lessons.*.quiz|integer|min:0|max:100',
            'modules.*.lessons.*.quiz.questions' => 'required_with:modules.*.lessons.*.quiz|array|min:1',
            'modules.*.lessons.*.quiz.questions.*.type' => 'required|in:multiple_choice,essay',
            'modules.*.lessons.*.quiz.questions.*.question' => 'required|string',
            'modules.*.lessons.*.quiz.questions.*.points' => 'required|numeric|min:0',
            'modules.*.lessons.*.quiz.questions.*.difficulty' => 'required|in:easy,medium,hard',
            'modules.*.lessons.*.quiz.questions.*.answers' => 'required_if:modules.*.lessons.*.quiz.questions.*.type,multiple_choice|array|min:2',
            'modules.*.lessons.*.quiz.questions.*.answers.*.content' => 'required|string',
            'modules.*.lessons.*.quiz.questions.*.answers.*.is_correct' => 'required|boolean',
        ];
    }
}
