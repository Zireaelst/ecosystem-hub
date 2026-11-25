'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize, Minimize } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const control = 'grid size-11 place-items-center rounded-lg border border-line transition-colors hover:border-brand'

/**
 * An image that opens large on click; arrow keys and buttons step through all `images`, a button switches to fullscreen.
 * Each instance owns its dialog, so the triggers can sit anywhere on the page.
 */
export function LightboxImage({ images, index, label, className }: { images: string[]; index: number; label: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="block w-full cursor-zoom-in" aria-label={label}>
        {/* eslint-disable-next-line @next/next/no-img-element -- own CDN upload */}
        <img src={images[index]} alt="" loading={index === 0 ? undefined : 'lazy'} className={className} />
      </DialogTrigger>
      {open && <Viewer images={images} start={index} />}
    </Dialog>
  )
}

/** The open dialog (mounted only while open, so state starts fresh and `document` is available). */
function Viewer({ images, start }: { images: string[]; start: number }) {
  const [current, setCurrent] = useState(start)
  const [full, setFull] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const many = images.length > 1
  const step = (d: number) => setCurrent((c) => (c + d + images.length) % images.length)

  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      if (document.fullscreenElement) void document.exitFullscreen()
    }
  }, [])

  return (
    <DialogContent
      ref={ref}
      className={cn(
        'gap-3 border-line bg-surface-1 p-3',
        // The browser's fullscreen style resets `transform`, not Tailwind's `translate`.
        full ? 'h-full max-w-none translate-x-0 translate-y-0 grid-rows-[minmax(0,1fr)_auto] rounded-none border-0' : 'w-fit max-w-[calc(100%-1rem)] sm:max-w-[calc(100%-4rem)]',
      )}
      onKeyDown={(e) => {
        if (!many) return
        if (e.key === 'ArrowRight') step(1)
        else if (e.key === 'ArrowLeft') step(-1)
      }}
    >
      <DialogTitle className="sr-only">Image {current + 1} of {images.length}</DialogTitle>
      {/* Never larger than the file itself: no upscaling, the dialog fits the image. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- own CDN upload */}
      <img src={images[current]} alt="" className={cn('max-w-full place-self-center', full ? 'max-h-full' : 'max-h-[calc(100dvh-8rem)]')} />
      <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-4">
        <span />
        <div className="flex items-center justify-center gap-4">
          {many && (
            <>
              <button type="button" onClick={() => step(-1)} aria-label="Previous image" className={control}><ChevronLeft className="size-5" aria-hidden /></button>
              <span className="text-sm text-fg-muted tabular-nums" aria-live="polite">{current + 1} / {images.length}</span>
              <button type="button" onClick={() => step(1)} aria-label="Next image" className={control}><ChevronRight className="size-5" aria-hidden /></button>
            </>
          )}
        </div>
        {document.fullscreenEnabled && (
          <button type="button" onClick={() => void (full ? document.exitFullscreen() : ref.current?.requestFullscreen())} aria-label={full ? 'Exit fullscreen' : 'Fullscreen'} className={control}>
            {full ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
          </button>
        )}
      </div>
    </DialogContent>
  )
}
