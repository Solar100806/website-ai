"use client";

import { getErrorMessage } from "@/src/shared/lib/user-error";
import { useEffect, useCallback, useState } from "react";
import Link from "next/link";
import { twMerge } from "tailwind-merge";
import toast from "react-hot-toast";
import { StepIndicator } from "./StepIndicator";
import { Step1BasicInfo } from "./Step1BasicInfo";
import { Step2CourseStructure } from "./Step2CourseStructure";
import { Step3SettingsPrice } from "./Step3SettingsPrice";
import { AIOutlineModal } from "./AIOutlineModal";
import type { CourseBasicInfo, StepKey } from "../types";
import { useCreateCourseWizard, CourseWizardPayload, useProposeCategory } from "../api";
import { useCreateModule, useCreateLesson, useCreateQuiz } from "../../lesson-management/api";
import { useCreateCourseStore } from "../stores/createCourseStore";
import { OTHER_CATEGORY_VALUE } from "../constants";
import { ArrowLeft, ArrowRight, BookOpen, Check, Eye, Save, Settings, Sparkles, Tag, Trash2, X } from "lucide-react";

export function CreateCourseContainer() {
 const mode = "create"; // Currently creating course
 
 // ── Zustand store ─────────────────────────────────────────────────────────────
 const step = useCreateCourseStore((s) => s.step);
 const idempotencyKey = useCreateCourseStore((s) => s.idempotencyKey);
 const courseInfo = useCreateCourseStore((s) => s.courseInfo);
 const modules = useCreateCourseStore((s) => s.modules);
 const settings = useCreateCourseStore((s) => s.settings);
 const setCourseInfo = useCreateCourseStore((s) => s.setCourseInfo);
 const setStep = useCreateCourseStore((s) => s.setStep);
 const goNext = useCreateCourseStore((s) => s.goNext);
 const goBack = useCreateCourseStore((s) => s.goBack);
 const resetDraft = useCreateCourseStore((s) => s.resetDraft);
 const hydrate = useCreateCourseStore((s) => s.hydrate);

 // ── Modals & State ────────────────────────────────────────────────────────────
 const [isOutlineOpen, setIsOutlineOpen] = useState(false);
 const [isPublishing, setIsPublishing] = useState(false);
 const [publishError, setPublishError] = useState<string | null>(null);

 // ── API mutations ─────────────────────────────────────────────────────────────
 const { mutateAsync: createCourseWizard } = useCreateCourseWizard();
 const { mutateAsync: proposeCategory } = useProposeCategory();

 useEffect(() => {
 hydrate();
 }, [hydrate]);

 const handleChange = useCallback(
 <K extends keyof CourseBasicInfo>(key: K, value: CourseBasicInfo[K]) => {
 setCourseInfo(key, value);
 },
 [setCourseInfo],
 );

 const handleApplyOutline = useCallback((outline: any) => {
 const uid = () => Math.random().toString(36).slice(2, 9);
 if (outline && outline.chapters && Array.isArray(outline.chapters)) {
 const newModules = outline.chapters.map((ch: any, cIdx: number) => ({
 id: uid(),
 title: ch.title,
 description: "",
 order: cIdx + 1,
 expanded: true,
 showAiSuggestion: false,
 lessons: ch.lessons.map((lesson: any, lIdx: number) => {
 const lessonTitle = typeof lesson === "string" ? lesson : lesson.title;
 const lessonType = typeof lesson === "string" ? "document" : (lesson.type === "quiz" ? "quiz" : "document");

 const draftLesson: any = {
 id: uid(),
 title: lessonTitle,
 type: lessonType as "video" | "quiz" | "document",
 order: lIdx + 1,
 };

 // Gắn nội dung HTML cho bài tài liệu
 if (lessonType === "document" && typeof lesson === "object" && lesson.content) {
 draftLesson.content = lesson.content;
 }

 if (typeof lesson === "object" && lesson.quizData) {
 draftLesson.quizData = lesson.quizData;
 } else if (lessonType === "quiz" && typeof lesson === "object" && Array.isArray(lesson.questions)) {
 draftLesson.quizData = {
 title: lessonTitle,
 time_limit_minutes: 15,
 passing_score: 80,
 questions: lesson.questions.map((q: any) => ({
 id: uid(),
 type: q.type || "multiple_choice",
 question: q.content || q.question || "",
 content: q.content || q.question || "",
 explanation: q.explanation || "",
 sample_answer: q.sample_answer || "",
 rubric: q.rubric || "",
 points: q.points || (q.type === "essay" ? 5.0 : 1.0),
 difficulty: q.difficulty || "medium",
 answers: (q.answers || []).map((a: any) => ({
 id: uid(),
 content: a.content || a.answer || "",
 is_correct: a.is_correct === true,
 })),
 })),
 };
 }

 return draftLesson;
 }),
 }));
 useCreateCourseStore.getState().setModules(newModules);
 }
 setIsOutlineOpen(false);
 }, []);

 const [errors, setErrors] = useState<Record<string, string>>({});

 const handleNext = useCallback(() => {
 setErrors({}); // Clear old errors
 if (step === 1) {
 let isValid = true;
 const newErrors: Record<string, string> = {};

 if (!courseInfo.title || courseInfo.title.trim().length < 3) {
 newErrors.title = "Tên khóa học phải chứa ít nhất 3 ký tự.";
 isValid = false;
 }
 if (!courseInfo.description || courseInfo.description.trim().length < 30) {
 newErrors.description = "Mô tả khóa học phải chứa ít nhất 30 ký tự.";
 isValid = false;
 }
 if (courseInfo.field === OTHER_CATEGORY_VALUE && !courseInfo.otherName?.trim()) {
 newErrors.otherName = "Vui lòng nhập tên lĩnh vực.";
 isValid = false;
 }
 if (courseInfo.field !== OTHER_CATEGORY_VALUE && !courseInfo.categoryId) {
 toast.error("Vui lòng chọn lĩnh vực.");
 isValid = false;
 }

 if (!isValid) {
 setErrors(newErrors);
 return;
 }
 }
 if (step === 2) {
 let isValid = true;
 let errorMessage = "";
 
 if (modules.length === 0) {
 isValid = false;
 errorMessage = "Vui lòng thêm ít nhất một chương học.";
 } else {
 const hasAnyLesson = modules.some(m => m.lessons.length > 0);
 if (!hasAnyLesson) {
 isValid = false;
 errorMessage = "Vui lòng thêm ít nhất một bài học.";
 }
 }
 
 if (!isValid) {
 toast.error(errorMessage);
 return;
 }
 }
 if (step < 3) {
 goNext();
 }
 }, [step, courseInfo, modules, goNext]);

 const handleBack = useCallback(() => {
 goBack();
 }, [goBack]);

 const handlePublish = useCallback(async () => {
 setPublishError(null);
 setIsPublishing(true);

 try {

 let categoryId = courseInfo.categoryId;
 if (courseInfo.field === OTHER_CATEGORY_VALUE || !categoryId) {
 const otherName = courseInfo.otherName.trim();
 if (!otherName) {
 throw new Error("Vui lòng chọn danh mục hoặc nhập lĩnh vực khác.");
 }
 const proposed = await proposeCategory(otherName);
 categoryId = proposed.id;
 }

    const priceNum = Number(String(settings.basePrice).replace(/[^0-9]/g, ""));
    if (priceNum !== 0 && (priceNum < 100000 || priceNum > 100000000)) {
      throw new Error("Giá khóa học phải bằng 0 hoặc từ 100.000 đến 100.000.000 VNĐ.");
    }

    const isFlashSaleActive = priceNum > 0 && Boolean(settings.isFlashSale);
    const salePriceNum = settings.salePrice ? Number(String(settings.salePrice).replace(/[^0-9]/g, "")) : undefined;
    
    if (isFlashSaleActive) {
      if (!salePriceNum || salePriceNum >= priceNum) {
        throw new Error("Giá giảm phải nhỏ hơn giá gốc.");
      }
      if (!settings.saleStartDate || !settings.saleEndDate) {
        throw new Error("Vui lòng chọn thời gian bắt đầu và kết thúc flash sale.");
      }
    }
    
    const validSalePrice = (isFlashSaleActive && salePriceNum && salePriceNum < priceNum) ? salePriceNum : undefined;

    const payload: CourseWizardPayload = {
      title: courseInfo.title,
      description: courseInfo.description,
      level: courseInfo.difficulty,
      category_id: categoryId,
      other_category_name: courseInfo.field === OTHER_CATEGORY_VALUE ? courseInfo.otherName.trim() : undefined,
      thumbnail_media_id: courseInfo.thumbnailMediaId || undefined,
      modules: modules.map(m => ({
        title: m.title,
        order: m.order,
        lessons: m.lessons.map(l => ({
          title: l.title,
          type: l.type === 'quiz' ? 'quiz_module' : (l.type === 'document' ? 'article' : l.type),
          content: l.content || "",
          order: l.order,
          temp_media_ids: l.temp_media_ids || (l as any).tempMediaIds || [],
          video_url: l.video_url || (l as any).videoUrl || "",
          quiz: l.quizData,
        }))
      })),
      price: priceNum,
      partnership_tier: settings.partnershipTier || "standard",
      flash_sale: isFlashSaleActive ? {
        sale_price: validSalePrice!,
        start_date: settings.saleStartDate!,
        end_date: settings.saleEndDate!
      } : undefined
    };

    await createCourseWizard({ payload, idempotencyKey });

    resetDraft();
    toast.success("Tạo khóa học thành công!");
    window.location.href = "/instructor/courses";
  } catch (error: any) {
    console.error("Publish failed:", error);
    setPublishError(getErrorMessage(error, "Không thể tạo khóa học. Vui lòng thử lại."));
  } finally {
    setIsPublishing(false);
  }
 }, [
  courseInfo,
  modules,
  settings,
  idempotencyKey,
  createCourseWizard,
  proposeCategory,
  resetDraft,
 ]);

 const createStepLabels: Record<1 | 2 | 3, string> = {
 1: "Thông tin cơ bản",
 2: "Nội dung khóa học",
 3: "Cài đặt & Giá",
 };

 return (
 <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-16">
 {/* ── Header Bar ──────────────────────────────────────────────────────── */}
 <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-4 shadow-sm">
 <div className="max-w-6xl mx-auto flex flex-col gap-4">
 <div className="flex flex-wrap items-center justify-between gap-4">
 <div className="flex items-center gap-3">
 <Link
 href="/instructor/courses"
 className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors shadow-sm"
 title="Quay lại danh sách khóa học"
 >
 <ArrowLeft size={18} />
 </Link>
 <div>
 <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5 font-semibold">
 <Link href="/instructor/courses" className="hover:text-blue-600 transition-colors">
 Khóa học của tôi
 </Link>
 <span>/</span>
 <span className="text-blue-500 font-semibold">
 Studio Tạo Khóa Học AI
 </span>
 </nav>
 <div className="flex items-center gap-2.5">
 <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate max-w-md md:max-w-xl">
 {createStepLabels[step as 1 | 2 | 3] || "Studio Khóa học"}
 </h1>
 </div>
 </div>
 </div>

 <div className="flex items-center gap-2.5">

 <button
 type="button"
 id="btn-finish-publish"
 onClick={() => setIsOutlineOpen(true)}
 className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 shadow-sm transition-all cursor-pointer"
 >
 <Sparkles size={13} />
 <span>Sinh đề cương AI</span>
 </button>
 </div>
 </div>

 <StepIndicator currentStep={step} />
 </div>
 </header>

 {/* ── Studio Workspace Content ────────────────────────────────────────── */}
 <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-8 flex flex-col gap-6">
 
 {publishError && (
 <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center justify-between">
 <span>{publishError}</span>
 <button type="button" onClick={() => setPublishError(null)} aria-label="Đóng thông báo lỗi" className="text-rose-500 hover:text-rose-700 ml-3"><X className="h-4 w-4" aria-hidden /></button>
 </div>
 )}

 {step === 1 && (
 <div className="flex flex-col gap-6">
 <Step1BasicInfo data={courseInfo} onChange={handleChange} errors={errors} />
 </div>
 )}

 {step === 2 && (
 <div className="flex flex-col gap-6">


 <Step2CourseStructure />
 </div>
 )}

 {step === 3 && (
 <Step3SettingsPrice
 courseTitle={courseInfo.title || "Khóa học chưa đặt tên"}
 thumbnailPreview={courseInfo.thumbnailPreview}
 />
 )}

 {/* Wizard Navigation Footer */}
 <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between bg-white p-5 rounded-xl shadow-sm">
 <button
 type="button"
 onClick={handleBack}
 disabled={step === 1}
 className="flex items-center gap-2 px-4.5 py-2.5 rounded-lg text-xs font-bold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
 >
 <span><ArrowLeft className="inline h-4 w-4 mr-1 align-text-bottom" aria-hidden />Quay lại</span>
 </button>

 <button
 type="button"
 onClick={step === 3 ? handlePublish : handleNext}
 disabled={isPublishing}
 className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 shadow-sm transition-all cursor-pointer disabled:opacity-70"
 >
 {step === 3 ? (
 <>
 <Sparkles size={14} />
 <span>{isPublishing ? "Đang xử lý..." : "Hoàn tất & Tạo khóa học"}</span>
 </>
 ) : (
 <>
 <span>Tiếp theo</span>
 <ArrowRight size={14} />
 </>
 )}
 </button>
 </div>
 </main>

 <AIOutlineModal
 isOpen={isOutlineOpen}
 onClose={() => setIsOutlineOpen(false)}
 onApply={handleApplyOutline}
 />
 </div>
 );
}
