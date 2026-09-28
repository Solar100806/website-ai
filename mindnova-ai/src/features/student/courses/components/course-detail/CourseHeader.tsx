"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { CourseDetailHeaderInfo } from "../../types";
import { Clock, Star, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { RefundConditionsButton } from "./RefundConditionsButton";

const SAVED_COURSES_KEY = "mindnova_saved_courses_v1";

export function CourseHeader({ info }: { info?: CourseDetailHeaderInfo }) {
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (!info?.id) return;

    try {
      const raw = window.localStorage.getItem(SAVED_COURSES_KEY);
      const savedIds = raw ? (JSON.parse(raw) as Array<string | number>) : [];
      setIsSaved(savedIds.some((id) => String(id) === String(info.id)));
    } catch {
      setIsSaved(false);
    }
  }, [info?.id]);

  const title = info?.title || "Khóa học AI MindNova";
  const level = info?.level || "Beginner";
  const description = info?.description || "Chương trình đào tạo chất lượng cao cung cấp kiến thức nền tảng và nâng cao.";
  const nextLesson = info?.next_lesson_title;
  const nextLessonId = info?.next_lesson_id;
  const isCourseCompleted = !!info?.is_completed;
  const durationText = info?.duration_text || "Chưa có thời lượng";
  const ratingText = info?.rating_text || "0.0 (0 Đánh giá)";
  const studentsText = info?.students_text || "0 Học viên tích cực";
  const categoryTag = info?.category_tag || "Khóa học AI";
  const isEnrolled = !!info?.is_enrolled;

  const handleSaveToggle = () => {
    if (!info?.id) return;

    const courseId = String(info.id);
    const raw = window.localStorage.getItem(SAVED_COURSES_KEY);
    const savedIds: Array<string | number> = raw ? JSON.parse(raw) : [];
    const nextSavedIds = isSaved
      ? savedIds.filter((id) => String(id) !== courseId)
      : [...savedIds.filter((id) => String(id) !== courseId), courseId];

    window.localStorage.setItem(SAVED_COURSES_KEY, JSON.stringify(nextSavedIds));
    setIsSaved(!isSaved);
    toast.success(!isSaved ? "Đã lưu khóa học vào danh sách quan tâm của bạn!" : "Đã bỏ lưu khóa học.");
  };

  return (
    <div className="mb-8">
      {/* ─── Editorial Hero Banner ─── */}
      <section className="relative overflow-hidden rounded-xl bg-slate-50 border border-slate-200 p-6 sm:p-8 transition-all duration-300">
        <div className="relative z-10 flex flex-col gap-6">
          {/* Breadcrumb & Pill tag */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Link href={isEnrolled ? "/courses" : "/explore"} className="hover:text-slate-900 transition-colors text-decoration-none">
                {isEnrolled ? "Khóa học của tôi" : "Khám phá"}
              </Link>
              <ChevronRight size={14} className="text-slate-400" />
              <span className="text-slate-900 font-semibold">
                Chi tiết học phần
              </span>
            </nav>

            <div className="flex items-center gap-2">
              <span className="inline-block text-[11px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                {categoryTag}
              </span>
              <span className="inline-block text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 capitalize">
                {level}
              </span>
            </div>
          </div>

          {/* Title & Description */}
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-semibold tracking-tight text-slate-900 leading-tight">
              {title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-3xl">
              {description}
            </p>
          </div>

          {/* Metadata Badges Row */}
          <div className="flex flex-wrap items-center gap-3 text-xs pt-4 mt-2 border-t border-slate-200/60">
            <span className="inline-flex items-center gap-1.5 px-1 py-1.5 text-slate-900">
              <Clock size={14} className="text-slate-500" />
              <span className="font-semibold">{durationText}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-1 py-1.5 text-slate-900">
              <Star size={14} className="fill-yellow-500 text-yellow-500" />
              <span className="font-semibold">{ratingText}</span>
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {isEnrolled ? (
              <>
                {nextLessonId ? (
                  <Link
                    href={`/courses/lesson?courseId=${info?.id}&lessonId=${nextLessonId}`}
                    className="flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs sm:text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors shadow-sm text-decoration-none"
                  >
                    {isCourseCompleted || !nextLesson ? (
                      <span>Ôn tập lại khóa học</span>
                    ) : (
                      <span>Tiếp tục bài học: <strong className="font-normal underline decoration-white/50">{nextLesson}</strong></span>
                    )}
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={handleSaveToggle}
                  className={`flex items-center justify-center px-4 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isSaved
                      ? "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100"
                      : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <span>{isSaved ? "Đã lưu vào danh mục" : "Lưu khóa học"}</span>
                </button>

              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSaveToggle}
                  className={`flex items-center justify-center px-4 py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    isSaved
                      ? "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100"
                      : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <span>{isSaved ? "Đã lưu vào danh mục" : "Lưu khóa học"}</span>
                </button>
              </>
            )}
            <RefundConditionsButton />
          </div>
        </div>
      </section>

    </div>
  );
}
