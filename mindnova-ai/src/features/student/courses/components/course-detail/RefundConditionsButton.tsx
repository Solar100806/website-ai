"use client";

import { useId, useRef } from "react";
import { BadgeInfo, X } from "lucide-react";

export function RefundConditionsButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <BadgeInfo size={16} aria-hidden="true" />
        Điều kiện hoàn tiền
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
      >
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">Điều kiện hoàn tiền</h2>
            <button type="button" autoFocus aria-label="Đóng điều kiện hoàn tiền" onClick={() => dialogRef.current?.close()} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <p className="text-sm leading-6 text-slate-600">Yêu cầu hoàn tiền cần đáp ứng đồng thời các điều kiện sau:</p>
          <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-6">
            <li>Khóa học thuộc đơn hàng đã thanh toán thành công và chưa được hoàn tiền.</li>
            <li>Gửi yêu cầu trong vòng <strong>30 ngày kể từ ngày mua</strong>.</li>
            <li>Tiến độ học tập <strong>không quá 10%</strong> và số bài đã hoàn thành <strong>không quá 5 bài</strong>.</li>
          </ul>
          <p className="mt-5 rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-900">Để gửi yêu cầu, vào mục Thanh toán, chọn giao dịch mua khóa học và nhấn Hoàn tiền. Bạn cần có tài khoản nhận hoàn tiền đã lưu và xác nhận tài khoản đó.</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">Đây là thông tin chính sách. Điều kiện của đơn hàng được kiểm tra khi bạn gửi yêu cầu hoàn tiền.</p>
          <button type="button" onClick={() => dialogRef.current?.close()} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Đã hiểu</button>
        </div>
      </dialog>
    </>
  );
}
