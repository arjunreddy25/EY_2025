import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle, Loader2, Phone, Mail } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface KYCDialogProps {
  isOpen: boolean;
  onClose: () => void;
  phone: string;
}

export function KYCDialog({ isOpen, onClose, phone }: KYCDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles].slice(0, 3)); // Max 3 files
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      // Upload each file
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        await fetch(`${API_BASE}/upload/kyc-document`, {
          method: 'POST',
          body: formData
        });
      }

      // Show success state
      setIsComplete(true);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  if (isComplete) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <DialogTitle className="text-xl mb-2">Documents Submitted!</DialogTitle>
            <DialogDescription className="text-base mb-6">
              We've received your KYC documents. Our team will review them and contact you shortly.
            </DialogDescription>
            
            <div className="bg-muted rounded-lg p-4 text-left space-y-2">
              <p className="font-medium text-sm">Our team will contact you at:</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span>{phone}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-4 h-4" />
                <span>loans@eybank.com</span>
              </div>
            </div>
            
            <Button onClick={onClose} className="mt-6 cursor-pointer">
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload KYC Documents</DialogTitle>
          <DialogDescription>
            We don't have your records yet. Please upload your ID documents to get started.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Drop Zone */}
          <div 
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Click to upload Aadhar, PAN, or other ID documents
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, JPG, PNG (max 3 files)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Selected Files */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 cursor-pointer"
                    onClick={() => removeFile(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Upload Button */}
          <Button 
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading}
            className="w-full cursor-pointer"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              `Upload ${files.length} Document${files.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
