import type { GenerationParams } from './generation-options.ts'

export function isSeedanceModelId(model: string): boolean {
  return /^(?:dreamina-)?seedance-2-5(?:-|$)/i.test(model.trim())
}

export function buildSeedancePayload(model: string, prompt: string, params: GenerationParams | undefined, images: string[] = []) {
  const video = params?.video || {}
  const duration = video.duration ?? 5
  const resolution = video.resolution ?? '720p'
  const aspectRatio = video.aspectRatio ?? '16:9'
  if (!Number.isInteger(duration) || duration < 4 || duration > 30) throw new Error('Seedance 2.5 duration must be an integer from 4 to 30 seconds.')
  if (!['480p', '720p', '1080p'].includes(resolution)) throw new Error('Select a supported Seedance resolution.')
  if (!['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'].includes(aspectRatio)) throw new Error('Select a supported Seedance aspect ratio.')
  if (video.generateAudio !== undefined && typeof video.generateAudio !== 'boolean') throw new Error('Seedance audio must be enabled or disabled.')
  if (images.length > 1) throw new Error('Seedance currently accepts at most one first-frame image.')
  return {
    model,
    content: [
      { type: 'text', text: prompt },
      ...images.map((url) => ({ type: 'image_url', image_url: { url }, role: 'first_frame' })),
    ],
    duration,
    resolution,
    ratio: images.length ? 'adaptive' : aspectRatio,
    generate_audio: video.generateAudio ?? false,
  }
}
