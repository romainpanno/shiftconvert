export interface UtilityInfo {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  category: 'fonts' | 'images' | 'video' | 'audio' | 'files';
}

export const utilities: UtilityInfo[] = [
  // Fonts
  {
    id: 'font-metadata',
    label: 'Métadonnées Fonts',
    description: 'Éditer les métadonnées de polices en batch',
    icon: 'Type',
    color: 'from-orange-500 to-amber-500',
    category: 'fonts',
  },
  // Images
  {
    id: 'image-crop',
    label: 'Recadrer Image',
    description: 'Recadrer et rogner des images',
    icon: 'Crop',
    color: 'from-pink-500 to-rose-500',
    category: 'images',
  },
  {
    id: 'image-resize',
    label: 'Redimensionner Image',
    description: 'Changer la taille des images',
    icon: 'Maximize2',
    color: 'from-pink-500 to-rose-500',
    category: 'images',
  },
  {
    id: 'image-compress',
    label: 'Compresser Image',
    description: 'Réduire la taille des fichiers image',
    icon: 'Minimize2',
    color: 'from-pink-500 to-rose-500',
    category: 'images',
  },
  {
    id: 'image-rotate',
    label: 'Rotation Image',
    description: 'Pivoter et retourner des images',
    icon: 'RotateCw',
    color: 'from-pink-500 to-rose-500',
    category: 'images',
  },
  // Video
  {
    id: 'video-trim',
    label: 'Couper Vidéo',
    description: 'Extraire une portion de vidéo',
    icon: 'Scissors',
    color: 'from-purple-500 to-violet-500',
    category: 'video',
  },
  {
    id: 'video-crop',
    label: 'Recadrer Vidéo',
    description: 'Recadrer et rogner des vidéos',
    icon: 'Crop',
    color: 'from-purple-500 to-violet-500',
    category: 'video',
  },
  {
    id: 'video-resize',
    label: 'Redimensionner Vidéo',
    description: 'Changer la résolution vidéo',
    icon: 'Maximize2',
    color: 'from-purple-500 to-violet-500',
    category: 'video',
  },
  {
    id: 'video-compress',
    label: 'Compresser Vidéo',
    description: 'Réduire la taille des fichiers vidéo',
    icon: 'Minimize2',
    color: 'from-purple-500 to-violet-500',
    category: 'video',
  },
  {
    id: 'video-extract-audio',
    label: 'Extraire Audio',
    description: 'Extraire la piste audio d\'une vidéo',
    icon: 'Music',
    color: 'from-purple-500 to-violet-500',
    category: 'video',
  },
  // Audio
  {
    id: 'audio-trim',
    label: 'Couper Audio',
    description: 'Extraire une portion audio',
    icon: 'Scissors',
    color: 'from-green-500 to-emerald-500',
    category: 'audio',
  },
  {
    id: 'audio-normalize',
    label: 'Normaliser Audio',
    description: 'Ajuster le volume automatiquement',
    icon: 'Volume2',
    color: 'from-green-500 to-emerald-500',
    category: 'audio',
  },
  // Files
  {
    id: 'create-zip',
    label: 'Créer ZIP',
    description: 'Compresser des fichiers en archive ZIP',
    icon: 'FolderArchive',
    color: 'from-slate-500 to-zinc-500',
    category: 'files',
  },
  {
    id: 'extract-zip',
    label: 'Extraire ZIP',
    description: 'Décompresser des archives ZIP/RAR',
    icon: 'FolderOpen',
    color: 'from-slate-500 to-zinc-500',
    category: 'files',
  },
  {
    id: 'qr-code',
    label: 'Générateur QR Code',
    description: 'Créer des QR codes à partir de texte/URL',
    icon: 'QrCode',
    color: 'from-slate-500 to-zinc-500',
    category: 'files',
  },
  {
    id: 'pdf-tools',
    label: 'Outils PDF',
    description: 'Fusionner, diviser, réorganiser, numéroter vos PDFs',
    icon: 'FileText',
    color: 'from-red-500 to-rose-500',
    category: 'files',
  },
];

export const getUtilityById = (id: string) => utilities.find((u) => u.id === id);

export const getUtilitiesByCategory = (category: string) =>
  utilities.filter((u) => u.category === category);
