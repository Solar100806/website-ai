import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Step1BasicInfo } from '../Step1BasicInfo';
import { axiosClient } from '@/src/shared/lib/axios';
import type { CourseBasicInfo } from '../../types';

vi.mock('@/src/shared/lib/axios', () => ({ axiosClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('next/image', () => ({ default: ({ fill, ...props }: any) => <img {...props} /> }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
function Harness() {
  const [data, setData] = useState<CourseBasicInfo>({ title: 'Khóa học thử', description: 'Mô tả khóa học', field: '', categoryId: null, categoryName: '', otherName: '', difficulty: 'beginner', thumbnailMediaId: null, thumbnailPreview: null });
  return <><Step1BasicInfo data={data} onChange={(key, value) => setData(prev => ({ ...prev, [key]: value }))} /><output aria-label="Mã ảnh đã lưu">{data.thumbnailMediaId}</output></>;
}
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:temporary-preview');
  vi.mocked(axiosClient.get).mockResolvedValue({ data: { data: [] } });
});
function selectImage() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><Harness /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText('Chọn ảnh bìa'), { target: { files: [new File(['image'], 'cover.jpg', { type: 'image/jpeg' })] } });
}
it('retains the uploaded thumbnail using the actual temp-media response and a reloadable URL', async () => {
  vi.mocked(axiosClient.post).mockResolvedValue({ data: { media_id: 321, url: 'https://cdn.example.com/temp/images/cover.jpg', media_type: 'image' } });
  selectImage();
  await waitFor(() => expect(screen.getByLabelText('Mã ảnh đã lưu')).toHaveTextContent('321'));
  expect(screen.getByAltText('Ảnh bìa khóa học')).toHaveAttribute('src', 'https://cdn.example.com/temp/images/cover.jpg');
});
it('allows another selection after an upload fails', async () => {
  vi.mocked(axiosClient.post).mockRejectedValue(new Error('Upload failed'));
  selectImage();
  expect(await screen.findByLabelText('Chọn ảnh bìa')).toBeInTheDocument();
  expect(screen.getByLabelText('Mã ảnh đã lưu')).toBeEmptyDOMElement();
});
