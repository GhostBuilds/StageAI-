
import { StagingStyle } from './types';

export const STAGING_STYLES = [
  { 
    id: StagingStyle.MODERN, 
    label: 'Modern', 
    icon: 'fa-couch',
    description: 'Clean lines, neutral palette, and sleek furniture.'
  },
  { 
    id: StagingStyle.RUSTIC, 
    label: 'Rustic', 
    icon: 'fa-tree',
    description: 'Natural wood, warm tones, and cozy textures.'
  },
  { 
    id: StagingStyle.SCANDINAVIAN, 
    label: 'Scandinavian', 
    icon: 'fa-snowflake',
    description: 'Bright, functional, and simple with wooden accents.'
  },
  { 
    id: StagingStyle.MINIMALIST, 
    label: 'Minimalist', 
    icon: 'fa-leaf',
    description: 'Essential items only, open space, and simple forms.'
  },
  { 
    id: StagingStyle.INDUSTRIAL, 
    label: 'Industrial', 
    icon: 'fa-building',
    description: 'Exposed elements, metal accents, and edgy vibe.'
  },
  { 
    id: StagingStyle.LUXURY, 
    label: 'Luxury', 
    icon: 'fa-crown',
    description: 'High-end materials, sophisticated lighting, and elegant decor.'
  },
  { 
    id: StagingStyle.EMPTY, 
    label: 'Empty / Declutter', 
    icon: 'fa-broom',
    description: 'Remove all existing furniture and show the clean architecture.'
  },
];

export const getPromptForStyle = (style: StagingStyle): string => {
  const basePrompt = "You are a professional real estate staging expert. Modify the provided photo of a room. Keep the exact walls, windows, floors, and architectural structure of the room identical. ";
  
  switch (style) {
    case StagingStyle.MODERN:
      return `${basePrompt} Stage the room with ultra-modern furniture, minimalist art, sleek lines, and a neutral color palette. Ensure high-quality realistic lighting as seen in architectural photography.`;
    case StagingStyle.RUSTIC:
      return `${basePrompt} Stage the room with rustic wooden furniture, warm textiles, earthy tones, and cozy farmhouse decor. Keep it looking warm and inviting.`;
    case StagingStyle.SCANDINAVIAN:
      return `${basePrompt} Stage the room in Scandinavian style with light wood, white walls, soft grey fabrics, and functional yet stylish furniture. Bright and airy atmosphere.`;
    case StagingStyle.MINIMALIST:
      return `${basePrompt} Stage the room with minimal furniture, simple shapes, and plenty of open floor space. Remove any unnecessary clutter.`;
    case StagingStyle.INDUSTRIAL:
      return `${basePrompt} Stage the room with industrial style elements: metal-framed furniture, reclaimed wood, leather accents, and Edison bulb lighting.`;
    case StagingStyle.LUXURY:
      return `${basePrompt} Stage the room with luxury high-end furniture, velvet textures, gold or marble accents, and sophisticated designer lighting.`;
    case StagingStyle.EMPTY:
      return `${basePrompt} Remove all furniture, decor, and items from the room. Return an image of the room completely empty, cleaned, and showing only the walls, floor, and ceiling.`;
    default:
      return basePrompt;
  }
};
