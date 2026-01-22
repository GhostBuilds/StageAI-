
export enum StagingStyle {
  MODERN = 'Modern',
  RUSTIC = 'Rustic',
  MINIMALIST = 'Minimalist',
  SCANDINAVIAN = 'Scandinavian',
  INDUSTRIAL = 'Industrial',
  EMPTY = 'Empty / Declutter',
  LUXURY = 'Luxury'
}

export interface StagedImage {
  id: string;
  style: StagingStyle;
  url: string;
  timestamp: number;
}

export interface RoomItem {
  id: string;
  originalImage: string; // The current image data
  sourceImage: string;   // The original "empty" photo for comparison
  styleLabel?: string;   // Optional label for generated variations
  stagedHistory: StagedImage[]; // Kept for backward compatibility but flattened for UI
}

export interface Folder {
  id: string;
  name: string;
  rooms: RoomItem[];
}

export interface Project {
  id: string;
  name: string;
  address: string;
  userName: string;
  createdAt: number;
  folders: Folder[];
}
