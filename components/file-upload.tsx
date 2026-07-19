'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Upload, X, FileIcon } from 'lucide-react'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSize?: number // em bytes
  label?: string
  description?: string
  currentFile?: {
    name: string
    mimeType?: string
  }
  onRemove?: () => void
  disabled?: boolean
}

export function FileUpload({
  onFileSelect,
  accept = '.pdf,.xlsx,.docx,.jpg,.jpeg,.png',
  maxSize = 10 * 1024 * 1024, // 10MB padrão
  label = 'Upload de arquivo',
  description,
  currentFile,
  onRemove,
  disabled = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  function validateFile(file: File): boolean {
    if (file.size > maxSize) {
      toast.error(`Arquivo muito grande. Máximo: ${maxSize / 1024 / 1024}MB`)
      return false
    }
    return true
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (validateFile(file)) {
        onFileSelect(file)
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files
    if (files && files.length > 0) {
      const file = files[0]
      if (validateFile(file)) {
        onFileSelect(file)
      }
    }
  }

  const acceptedFormats = accept.split(',').map((f) => f.trim()).join(', ')
  const fileIcon = currentFile ? <FileIcon className="size-4" /> : <Upload className="size-4" />

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>

      {currentFile ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm">
            {fileIcon}
            <span className="truncate text-muted-foreground">{currentFile.name}</span>
          </div>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={disabled}
              className="h-6 w-6 p-0"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-lg border-2 border-dashed p-6 transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          } ${disabled ? 'opacity-50' : ''}`}
        >
          <input
            type="file"
            accept={accept}
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
            id={`file-input-${Math.random()}`}
          />
          <label htmlFor={`file-input-${Math.random()}`} className="flex cursor-pointer flex-col items-center gap-2">
            <Upload className="size-6 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">Arraste ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground">
                {description || `Formatos: ${acceptedFormats}`}
              </p>
            </div>
          </label>
        </div>
      )}
    </div>
  )
}
