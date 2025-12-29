import type { CategoryInfo } from '../types';

export const categories: CategoryInfo[] = [
  {
    id: 'images',
    labelKey: 'category.images',
    descriptionKey: 'category.images.desc',
    icon: 'Image',
    color: 'from-pink-500 to-rose-500',
  },
  {
    id: 'documents',
    labelKey: 'category.documents',
    descriptionKey: 'category.documents.desc',
    limitationsKey: 'category.documents.limits',
    icon: 'FileText',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'audio',
    labelKey: 'category.audio',
    descriptionKey: 'category.audio.desc',
    icon: 'Music',
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'video',
    labelKey: 'category.video',
    descriptionKey: 'category.video.desc',
    icon: 'Video',
    color: 'from-purple-500 to-violet-500',
  },
  {
    id: 'fonts',
    labelKey: 'category.fonts',
    descriptionKey: 'category.fonts.desc',
    limitationsKey: 'category.fonts.limits',
    icon: 'Type',
    color: 'from-orange-500 to-amber-500',
  },
];

export const getCategoryById = (id: string) => categories.find((c) => c.id === id);
