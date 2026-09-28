import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CreateCourseContainer } from '../CreateCourseContainer';
import { useCreateCourseStore } from '../../stores/createCourseStore';
const { createWizard } = vi.hoisted(() => ({ createWizard: vi.fn() }));
vi.mock('../../api', () => ({ useCreateCourseWizard: () => ({ mutateAsync: createWizard }), useProposeCategory: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('../../../lesson-management/api', () => ({ useCreateModule: vi.fn(), useCreateLesson: vi.fn(), useCreateQuiz: vi.fn() }));
vi.mock('../Step1BasicInfo', () => ({ Step1BasicInfo: () => <div>Thông tin kiểm thử</div> }));
vi.mock('../Step2CourseStructure', () => ({ Step2CourseStructure: () => <div>Nội dung kiểm thử</div> }));
vi.mock('../Step3SettingsPrice', () => ({ Step3SettingsPrice: () => <div>Giá kiểm thử</div> }));
vi.mock('../AIOutlineModal', () => ({ AIOutlineModal: () => null }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  useCreateCourseStore.getState().resetDraft();
  useCreateCourseStore.setState({ courseInfo: { title: 'Khóa học chưa có ảnh', description: 'Mô tả khóa học đủ dài để vượt qua kiểm tra thông tin.', field: '1', categoryId: 1, categoryName: 'Toán', otherName: '', difficulty: 'beginner', thumbnailMediaId: null, thumbnailPreview: null }, modules: [{ id:'m1', title:'Chương một', order:1, expanded:true, lessons:[{id:'l1',title:'Bài học',type:'document',order:1,content:'Nội dung bài học'}] }], settings: { isDraft:true,isPublic:true,allowRating:true,currency:'VND',basePrice:'100000' } });
});
it('allows continuing past basic information without a cover', () => {
  render(<CreateCourseContainer />);
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp theo' }));
  expect(screen.getByText('Nội dung kiểm thử')).toBeVisible();
});
it('submits course creation without a cover', async () => {
  createWizard.mockImplementation(() => new Promise(() => {}));
  useCreateCourseStore.setState({ step:3 });
  render(<CreateCourseContainer />);
  fireEvent.click(screen.getByRole('button', { name: 'Hoàn tất & Tạo khóa học' }));
  await waitFor(() => expect(createWizard).toHaveBeenCalled());
  const payload=createWizard.mock.calls[0][0].payload;
  expect(payload.title).toBe('Khóa học chưa có ảnh');
  expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty('thumbnail_media_id');
});
