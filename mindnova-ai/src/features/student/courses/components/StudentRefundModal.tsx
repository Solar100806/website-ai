"use client";

import { getErrorMessage } from "@/src/shared/lib/user-error";

import React, { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, X, Check, PartyPopper, AlertTriangle, Loader2 } from "lucide-react";
import { axiosClient } from "@/src/shared/lib/axios";
import { useGetPaymentMethods } from "../../billing/api";

interface StudentRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string | number;
  courseTitle?: string;
  onSuccess?: () => void;
  embedded?: boolean;
}

export function StudentRefundModal({
  isOpen,
  onClose,
  courseId,
  courseTitle,
  onSuccess,
  embedded = false,
}: StudentRefundModalProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("Nội dung không phù hợp với nhu cầu");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [savedMethodId, setSavedMethodId] = useState<number | null>(null);
  const [confirmAccount, setConfirmAccount] = useState(false);
  const { data: savedMethods = [], isLoading: methodsLoading, isError: methodsError, refetch: refetchMethods } = useGetPaymentMethods();

  useEffect(() => {
    const preferred = savedMethods.find((method) => method.is_default) ?? savedMethods[0];
    if (preferred && savedMethodId === null) {
      setSavedMethodId(preferred.id);
    }
  }, [savedMethods, savedMethodId]);

  // Fetch refund eligibility from backend
  const { data: eligibility, isLoading, isFetching, isError: eligibilityError, refetch } = useQuery({
    queryKey: ["studentRefundEligibility", String(courseId)],
    queryFn: async () => {
      const res = await axiosClient.get(`/api/student/courses/${courseId}/refund-eligibility`);
      return res.data?.data;
    },
    enabled: isOpen && !!courseId,
    staleTime: 0,
    retry: false,
  });

  // Refund mutation
  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!eligibility?.is_eligible || isFetching || methodsLoading || methodsError || !savedMethods.some((method) => method.id === savedMethodId)) {
        throw new Error("Vui lòng kiểm tra điều kiện và chọn tài khoản nhận hoàn tiền.");
      }
      if (savedMethods.length > 0) {
        if (!savedMethodId) {
          throw new Error("Vui lòng chọn tài khoản nhận hoàn tiền.");
        }
        if (!confirmAccount) {
          throw new Error("Hãy xác nhận tài khoản nhận hoàn tiền.");
        }
      }
      const res = await axiosClient.post("/api/student/orders/refund", {
        course_id: courseId,
        reason,
        payment_method_id: savedMethodId || undefined,
      });
      return res.data;
    },
    onSuccess: (res) => {
      setIsError(false);
      setStatusMsg(res.message || "Hoàn tiền thành công!");
      queryClient.invalidateQueries({ queryKey: ["student"] });
      queryClient.invalidateQueries({ queryKey: ["studentRefundEligibility"] });
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
        setStatusMsg(null);
        window.location.href = "/courses";
      }, 2000);
    },
    onError: (err: any) => {
      setIsError(true);
      setStatusMsg(getErrorMessage(err, "Đã xảy ra lỗi khi hoàn tiền."));
    },
  });

  useEffect(() => {
    if (!isOpen && !refundMutation.isPending && !refundMutation.isSuccess) {
      setConfirmAccount(false);
      setStatusMsg(null);
    }
  }, [isOpen, refundMutation.isPending, refundMutation.isSuccess]);

  if (!isOpen) return null;

  const isEligible = !eligibilityError && !isFetching && eligibility?.is_eligible === true;

  return (
    <div className={embedded ? "mt-5 font-sans" : "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn font-sans"}>
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col animate-scaleIn">
        {/* Header */}
        {!embedded && <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 bg-blue-50 rounded-xl text-blue-500">
              <Banknote size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-[17px] font-semibold text-slate-900">Yêu cầu hoàn tiền</h3>
              <p className="text-[13px] font-medium text-slate-500">Chính sách bảo vệ quyền lợi học viên MindNova AI</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>}

        {/* Content Body */}
        <div className={embedded ? "p-3 sm:p-4 flex flex-col gap-4 bg-slate-50" : "p-6 flex flex-col gap-6 max-h-[75vh] overflow-y-auto bg-slate-50"}>
          {/* Course Summary Box */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Khóa học yêu cầu hoàn</span>
            <h4 className="text-[15px] font-semibold text-slate-900 mt-1.5">{eligibility?.course_title || courseTitle || "Khóa học của bạn"}</h4>
            {eligibility?.amount && (
              <p className="text-sm font-semibold text-blue-500 mt-2">
                Số tiền hoàn lại: {Number(eligibility.amount).toLocaleString("vi-VN")} VNĐ
              </p>
            )}
          </div>

          {/* Refund Rules Checklist */}
          <div className="flex flex-col gap-4 p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
            <h5 className="text-[13px] font-semibold text-slate-900">Kiểm tra điều kiện hoàn tiền</h5>

            {isLoading || isFetching ? (
              <p className="text-[13px] font-medium text-slate-500 text-center py-4">Đang kiểm tra dữ liệu học tập...</p>
            ) : eligibilityError ? (
              <div role="alert" className="text-sm text-rose-600">
                Không thể kiểm tra điều kiện hoàn tiền. Vui lòng thử lại.
                <button type="button" onClick={() => refetch()} className="ml-2 font-semibold underline">Thử lại</button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Rule 1: Within 30 days */}
                <div className="flex items-start gap-3">
                  <span className={twMerge("flex items-center justify-center w-5 h-5 rounded-full mt-0.5 shrink-0 transition-colors", eligibility?.within_30_days ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500")}>
                    {eligibility?.within_30_days ? <Check size={12} strokeWidth={3.5} /> : <X size={12} strokeWidth={3.5} />}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-slate-900">Thời hạn bảo hộ 30 ngày</span>
                    <span className="text-[13px] font-medium text-slate-500 mt-0.5">
                      {eligibility?.days_since_purchase !== undefined
                        ? `Đã mua ${eligibility.days_since_purchase} ngày trước`
                        : "Chưa xác định được ngày mua"}
                    </span>
                  </div>
                </div>

                {/* Rule 2: Progress <= 10% AND completed <= 5 */}
                <div className="flex items-start gap-3">
                  <span className={twMerge("flex items-center justify-center w-5 h-5 rounded-full mt-0.5 shrink-0 transition-colors", eligibility?.progress_eligible ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500")}>
                    {eligibility?.progress_eligible ? <Check size={12} strokeWidth={3.5} /> : <X size={12} strokeWidth={3.5} />}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-slate-900">Điều kiện tiến độ học tập</span>
                    <span className="text-[13px] font-medium text-slate-500 mt-0.5">
                      Đã hoàn thành {eligibility?.progress_percentage ?? 0}% ({eligibility?.completed_lessons ?? 0} bài học)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Status Message */}
          {!isLoading && !isFetching && !eligibilityError && (
            <div>
              {isEligible ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-500/20 flex flex-col gap-1.5 shadow-sm">
                  <div className="flex items-center gap-2 text-emerald-500 font-semibold text-[13px]">
                    <PartyPopper size={16} strokeWidth={2.5} />
                    <span>Bạn đủ điều kiện nhận lại 100% học phí!</span>
                  </div>
                  <p className="text-[13px] font-medium text-emerald-700">
                    Khóa học thỏa mãn tất cả các điều kiện hoàn tiền của MindNova AI.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-500/20 flex flex-col gap-2 shadow-sm">
                  <div className="flex items-center gap-2 text-rose-500 font-semibold text-[13px]">
                    <AlertTriangle size={16} strokeWidth={2.5} />
                    <span>Không đủ điều kiện hoàn tiền</span>
                  </div>
                  <ul className="list-disc list-inside text-[13px] font-medium text-[#B91C1C] flex flex-col gap-1 ml-1">
                    {(eligibility?.reasons?.length ? eligibility.reasons : [eligibility?.reason || "Vui lòng kiểm tra lại tiến độ hoặc thời hạn bảo hộ."]).map((r: string, idx: number) => (
                      <li key={idx}>{r}</li>
                    )) || <li>Vui lòng kiểm tra lại tiến độ hoặc thời hạn bảo hộ.</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Account Selection */}
          {isEligible && savedMethods.length > 0 && (
            <div className="flex flex-col gap-4 p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
              <label className="text-[13px] font-semibold text-slate-900">Tài khoản nhận tiền</label>
              <div className="flex flex-col gap-3">
                {savedMethods.map((method) => (
                  <label key={method.id} className="flex items-center gap-3 cursor-pointer group">
                    <div className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center shrink-0 transition-colors ${savedMethodId === method.id ? "border-blue-500 bg-blue-500" : "border-slate-300 group-hover:border-slate-400"}`}>
                      {savedMethodId === method.id && <span className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <input
                      type="radio"
                      className="sr-only"
                      checked={savedMethodId === method.id}
                      onChange={() => { setSavedMethodId(method.id); setConfirmAccount(false); }}
                    />
                    <span className="text-[13px] font-medium text-[#334155] group-hover:text-slate-900 transition-colors">{method.label}</span>
                  </label>
                ))}
              </div>
              <div className="h-[1px] bg-slate-200 w-full my-1" />
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-colors ${confirmAccount ? "bg-blue-500 border-blue-500" : "border-slate-300 group-hover:border-slate-400 bg-white"}`}>
                  {confirmAccount && <Check size={12} strokeWidth={4} className="text-white" />}
                </div>
                <input type="checkbox" className="sr-only" checked={confirmAccount} onChange={(e) => setConfirmAccount(e.target.checked)} />
                <span className="text-[13px] font-medium text-[#334155] group-hover:text-slate-900 transition-colors">Tôi xác nhận hoàn tiền về tài khoản này</span>
              </label>
            </div>
          )}
          {isEligible && methodsLoading && <p role="status">Đang tải tài khoản nhận tiền...</p>}
          {isEligible && methodsError && <p role="alert">Không thể tải tài khoản nhận tiền. <button type="button" onClick={() => refetchMethods()} className="font-semibold underline">Thử tải lại tài khoản</button></p>}
          {isEligible && !methodsLoading && !methodsError && savedMethods.length === 0 && (
            <p className="text-[13px] text-blue-500 font-medium bg-blue-50 p-4 rounded-xl border border-blue-500/20"><a href="/billing" className="underline">Thêm tài khoản nhận tiền</a> trước khi hoàn tiền.</p>
          )}

          {/* Reason Select */}
          {isEligible && (
            <div className="flex flex-col gap-2 p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
              <label className="text-[13px] font-semibold text-slate-900">Lý do hoàn tiền (Tùy chọn)</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 text-[13px] font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
              >
                <option value="Nội dung không phù hợp với nhu cầu">Nội dung không phù hợp với nhu cầu</option>
                <option value="Mua nhầm khóa học">Mua nhầm khóa học</option>
                <option value="Chất lượng bài giảng chưa đạt kỳ vọng">Chất lượng bài giảng chưa đạt kỳ vọng</option>
                <option value="Lý do cá nhân khác">Lý do cá nhân khác</option>
              </select>
            </div>
          )}

          {statusMsg && (
            <div className={twMerge("p-4 rounded-xl text-[13px] font-semibold shadow-sm", isError ? "bg-rose-50 text-rose-500 border border-rose-500/20" : "bg-slate-900 text-white")}>
              {statusMsg}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer"
          >
            Hủy bỏ
          </button>

          {isEligible && (
            <button
              type="button"
              onClick={() => refundMutation.mutate()}
              disabled={refundMutation.isPending || refundMutation.isSuccess || methodsLoading || methodsError || !savedMethods.some((method) => method.id === savedMethodId) || !confirmAccount}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white text-[13px] font-semibold shadow-md shadow-blue-500/20 hover:opacity-95 transition-all disabled:from-slate-400 disabled:to-slate-300 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {refundMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {refundMutation.isPending ? "Đang xử lý..." : "Xác nhận & Hoàn tiền"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
