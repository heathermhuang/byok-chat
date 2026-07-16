import type { AppendMessage, AttachmentAdapter, CompleteAttachment, PendingAttachment } from '@assistant-ui/react'
import { secureRandomId } from './random-id.ts'

export const ATTACHMENT_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/xml',
  'application/json',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'video/mp4',
  'video/webm',
  'video/quicktime',
].join(',')

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export type InputAttachment = {
  id: string
  name: string
  mediaType: string
  size: number
  kind: 'image' | 'document' | 'audio' | 'video' | 'file'
  dataUrl?: string
}

function attachmentKind(mediaType: string): InputAttachment['kind'] {
  if (mediaType.startsWith('image/')) return 'image'
  if (mediaType.startsWith('audio/')) return 'audio'
  if (mediaType.startsWith('video/')) return 'video'
  if (mediaType === 'application/pdf' || mediaType.startsWith('text/') || mediaType === 'application/json') return 'document'
  return 'file'
}

function fileDataUrl(file: File): Promise<string> {
  if (typeof FileReader === 'undefined') {
    return file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`
    })
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

function createAttachmentId(file: File): string {
  return `${file.name}-${secureRandomId()}`
}

export class ByokAttachmentAdapter implements AttachmentAdapter {
  accept = ATTACHMENT_ACCEPT

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    if (!file.size) throw new Error(`${file.name} is empty.`)
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${file.name} is larger than the 10 MB per-file limit.`)
    }
    return {
      id: createAttachmentId(file),
      type: attachmentKind(file.type),
      name: file.name,
      contentType: file.type || 'application/octet-stream',
      file,
      status: { type: 'requires-action', reason: 'composer-send' },
    }
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const dataUrl = await fileDataUrl(attachment.file)
    const content = attachment.type === 'image'
      ? [{ type: 'image' as const, image: dataUrl, filename: attachment.name }]
      : [{
          type: 'file' as const,
          filename: attachment.name,
          data: dataUrl,
          mimeType: attachment.contentType || 'application/octet-stream',
        }]
    return { ...attachment, status: { type: 'complete' }, content }
  }

  async remove(): Promise<void> {}
}

export function inputAttachmentsFromAppend(message: AppendMessage): InputAttachment[] {
  return (message.attachments || []).flatMap((attachment) => {
    const part = attachment.content?.find((item) => item.type === 'image' || item.type === 'file')
    if (!part) return []
    const mediaType = attachment.contentType || (part.type === 'file' ? part.mimeType : 'image/png')
    const dataUrl = part.type === 'file' ? part.data : part.image
    return [{
      id: attachment.id,
      name: attachment.name,
      mediaType,
      size: attachment.file?.size || 0,
      kind: attachmentKind(mediaType),
      dataUrl,
    }]
  })
}

export function attachmentOnlyPrompt(mode: 'chat' | 'image_generation' | 'video_generation', attachments: InputAttachment[]): string {
  if (!attachments.length) return ''
  if (mode === 'image_generation') return 'Edit the attached image while preserving its core subject and composition.'
  if (mode === 'video_generation') return 'Turn the attached image into a natural, cinematic video.'
  return attachments.some((attachment) => attachment.mediaType === 'application/pdf')
    ? 'Summarize the attached PDF.'
    : 'Analyze the attached file.'
}

export function formatAttachmentSize(bytes: number): string {
  if (!bytes) return 'session file'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
