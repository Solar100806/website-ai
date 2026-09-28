import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RefundConditionsButton } from '../RefundConditionsButton';
import { axiosClient } from '@/src/shared/lib/axios';

vi.mock('@/src/shared/lib/axios', () => ({ axiosClient: { get: vi.fn(), post: vi.fn() } }));
const eligible = { is_eligible: true, within_30_days: true, progress_eligible: true, days_since_purchase: 2, progress_percentage: 0, completed_lessons: 0, amount: 100000 };
let eligibility: Record<string, unknown>;
let methods: unknown[];
beforeEach(() => {
  vi.clearAllMocks();
  eligibility = eligible;
  methods = [{ id: 7, label: 'Ngân hàng • 1234', is_default: true }];
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  vi.mocked(axiosClient.get).mockImplementation(async (url) => ({ data: { data: String(url).includes('refund-eligibility') ? eligibility : methods } }));
});
afterEach(cleanup);
function open(enrolled = true) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><RefundConditionsButton courseId={14} courseTitle="Khóa học thử" isEnrolled={enrolled} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Điều kiện hoàn tiền' }));
}
it('lets an eligible learner submit from the policy dialog only after confirming the receiving account', async () => {
  vi.mocked(axiosClient.post).mockRejectedValue(new Error('Yêu cầu chưa được xử lý'));
  open();
  const submit = await screen.findByRole('button', { name: 'Xác nhận & Hoàn tiền' });
  expect(submit).toBeDisabled();
  expect(axiosClient.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(axiosClient.post).toHaveBeenCalledWith('/api/student/orders/refund', { course_id: 14, reason: 'Nội dung không phù hợp với nhu cầu', payment_method_id: 7 }));
  expect(await screen.findByText('Yêu cầu chưa được xử lý')).toBeVisible();
});
it('shows the server rejection reason and does not offer submission', async () => {
  eligibility = { is_eligible: false, reason: 'Khóa học đã được hoàn tiền.' };
  open();
  expect(await screen.findByText('Khóa học đã được hoàn tiền.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Xác nhận & Hoàn tiền' })).not.toBeInTheDocument();
});
it('keeps the policy available without protected API calls for a visitor without enrollment', () => {
  open(false);
  expect(screen.getByText(/30 ngày kể từ ngày mua/)).toBeVisible();
  expect(axiosClient.get).not.toHaveBeenCalled();
  expect(axiosClient.post).not.toHaveBeenCalled();
});
it('blocks submission when no receiving account exists', async () => {
  methods = [];
  open();
  expect(await screen.findByRole('button', { name: 'Xác nhận & Hoàn tiền' })).toBeDisabled();
  expect(screen.getByRole('link', { name: /Thêm tài khoản/ })).toBeVisible();
});
it('shows a retry action instead of treating a failed eligibility request as ineligible', async () => {
  let fail = true;
  vi.mocked(axiosClient.get).mockImplementation(async (url) => {
    if (String(url).includes('refund-eligibility') && fail) { fail = false; throw new Error('Mất kết nối'); }
    return { data: { data: String(url).includes('refund-eligibility') ? eligibility : methods } };
  });
  open();
  const retry = await screen.findByRole('button', { name: 'Thử lại' });
  expect(screen.queryByText('Không đủ điều kiện hoàn tiền')).not.toBeInTheDocument();
  fireEvent.click(retry);
  expect(await screen.findByRole('button', { name: 'Xác nhận & Hoàn tiền' })).toBeDisabled();
});

it('prevents duplicate requests while a refund is pending', async () => {
  vi.mocked(axiosClient.post).mockImplementation(() => new Promise(() => {}));
  open();
  const submit = await screen.findByRole('button', { name: 'Xác nhận & Hoàn tiền' });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(submit);
  await waitFor(() => expect(submit).toBeDisabled());
  fireEvent.click(submit);
  expect(axiosClient.post).toHaveBeenCalledTimes(1);
});
it('checks eligibility again and resets account confirmation when reopened', async () => {
  open();
  await screen.findByRole('button', { name: 'Xác nhận & Hoàn tiền' });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Đóng điều kiện hoàn tiền' }));
  eligibility = { is_eligible: false, reasons: ['Đã quá hạn hoàn tiền.'] };
  fireEvent.click(screen.getByRole('button', { name: 'Điều kiện hoàn tiền' }));
  expect(await screen.findByText('Đã quá hạn hoàn tiền.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Xác nhận & Hoàn tiền' })).not.toBeInTheDocument();
});
it('shows the server success response and prevents another submission', async () => {
  vi.mocked(axiosClient.post).mockResolvedValue({ data: { success: true, message: 'Đã ghi nhận hoàn tiền.' } });
  open();
  const submit = await screen.findByRole('button', { name: 'Xác nhận & Hoàn tiền' });
  fireEvent.click(screen.getByRole('checkbox'));
  // Keep the existing post-success redirect from navigating jsdom.
  const realSetTimeout = globalThis.setTimeout;
  const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: TimerHandler, delay?: number, ...args: unknown[]) => delay === 2000 ? 0 : realSetTimeout(callback, delay, ...args)) as typeof setTimeout);
  try {
    fireEvent.click(submit);
    expect(await screen.findByText('Đã ghi nhận hoàn tiền.')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận & Hoàn tiền' })).toBeDisabled());
    expect(axiosClient.post).toHaveBeenCalledTimes(1);
  } finally { timer.mockRestore(); }
});
it('keeps a pending refund blocked after closing and reopening the dialog', async () => {
  vi.mocked(axiosClient.post).mockImplementation(() => new Promise(() => {}));
  open();
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận & Hoàn tiền' }));
  await waitFor(() => expect(axiosClient.post).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Đóng điều kiện hoàn tiền' }));
  fireEvent.click(screen.getByRole('button', { name: 'Điều kiện hoàn tiền' }));
  expect(await screen.findByRole('button', { name: 'Đang xử lý...' })).toBeDisabled();
  expect(axiosClient.post).toHaveBeenCalledTimes(1);
});
it('lets learners retry loading receiving accounts without leaving the popup', async () => {
  let fail = true;
  vi.mocked(axiosClient.get).mockImplementation(async (url) => {
    if (String(url).includes('payment-methods') && fail) { fail = false; throw new Error('Mất kết nối'); }
    return { data: { data: String(url).includes('refund-eligibility') ? eligibility : methods } };
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Thử tải lại tài khoản' }));
  expect(await screen.findByRole('checkbox')).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'Xác nhận & Hoàn tiền' })).toBeEnabled();
});
