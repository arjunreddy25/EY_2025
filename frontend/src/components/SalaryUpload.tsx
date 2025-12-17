import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SalaryUploadProps {
    isOpen: boolean;
    onUploadComplete: (fileUrl: string, localPath: string) => void;
}

export function SalaryUpload({ isOpen, onUploadComplete }: SalaryUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [lastFileName, setLastFileName] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg'];
        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!allowedTypes.includes(fileExt)) {
            alert('Please upload a PDF or image file (PNG, JPG, JPEG)');
            return;
        }

        setIsUploading(true);
        setUploadStatus('idle');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('http://localhost:8000/upload/salary-slip', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Upload failed');
            }

            const data = await response.json();
            setUploadStatus('success');
            setLastFileName(file.name);

            // Notify parent component with the file URL and local path
            onUploadComplete(data.url, data.local_path);

        } catch (error) {
            console.error('Upload error:', error);
            setUploadStatus('error');
        } finally {
            setIsUploading(false);
            // Reset the input so the same file can be uploaded again
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleButtonClick = () => {
        fileInputRef.current?.click();
    };

    const getStatusIcon = () => {
        if (isUploading) return <Loader2 className="size-4 animate-spin" />;
        if (uploadStatus === 'success') return <CheckCircle className="size-4 text-green-500" />;
        if (uploadStatus === 'error') return <AlertCircle className="size-4 text-red-500" />;
        return <Upload className="size-4" />;
    };

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
                className="hidden"
            />

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size={isOpen ? "default" : "icon"}
                        onClick={handleButtonClick}
                        disabled={isUploading}
                        className={cn(
                            "w-full gap-3",
                            isOpen ? "justify-start px-3" : "justify-center",
                            uploadStatus === 'success' && "text-green-600 dark:text-green-400",
                            uploadStatus === 'error' && "text-red-600 dark:text-red-400"
                        )}
                    >
                        {getStatusIcon()}
                        {isOpen && (
                            <span className="truncate">
                                {isUploading
                                    ? 'Uploading...'
                                    : uploadStatus === 'success'
                                        ? `Uploaded: ${lastFileName?.slice(0, 15)}...`
                                        : 'Upload Salary Slip'}
                            </span>
                        )}
                    </Button>
                </TooltipTrigger>
                {!isOpen && (
                    <TooltipContent side="right">
                        {isUploading
                            ? 'Uploading...'
                            : uploadStatus === 'success'
                                ? 'Salary slip uploaded'
                                : 'Upload Salary Slip'}
                    </TooltipContent>
                )}
            </Tooltip>
        </>
    );
}
