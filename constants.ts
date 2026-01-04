import { Curriculum } from './types';

export const CURRICULUM: Curriculum = {
  '6': [
    { id: 'light', en: 'Light & Shadow', ta: 'ஒளி மற்றும் நிழல்' },
    { id: 'circuits', en: 'Simple Electric Circuits', ta: 'எளிய மின்சுற்றுகள்' },
    { id: 'changes', en: 'Physical & Chemical Changes', ta: 'இயற்பியல் & வேதியியல் மாற்றங்கள்' },
  ],
  '7': [
    { id: 'photo', en: 'Photosynthesis', ta: 'ஒளிச்சேர்க்கை' },
    { id: 'heat', en: 'Heat & Temperature', ta: 'வெப்பம் & வெப்பநிலை' },
    { id: 'motion', en: 'Motion & Time', ta: 'இயக்கம் & நேரம்' },
  ],
  '8': [
    { id: 'force', en: 'Force & Pressure', ta: 'விசை & அழுத்தம்' },
    { id: 'sound', en: 'Sound', ta: 'ஒலி' },
    { id: 'chemical', en: 'Chemical Effects of Electric Current', ta: 'மின்சாரத்தின் வேதியியல் விளைவுகள்' },
  ],
};

// Fallback message if API fails
export const FALLBACK_ERROR_MSG = "Sorry, something went wrong. Please try again. / மன்னிக்கவும், ஏதோ தவறு நடந்துவிட்டது.";
