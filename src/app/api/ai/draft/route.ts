import { createAiDraftHandler } from '@/lib/ai-draft-server';

export const runtime = 'nodejs';
export const maxDuration = 40;
export const POST = createAiDraftHandler();
