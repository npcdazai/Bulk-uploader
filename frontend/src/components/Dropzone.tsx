import { useRef, useState, type DragEvent } from 'react';
import { Box, Text, Stack, Icon } from '@chakra-ui/react';
import { FiUploadCloud, FiFile } from 'react-icons/fi';

interface DropzoneProps {
  file: File | null;
  onFile: (file: File | null) => void;
  invalid?: boolean;
  accept?: string;
}

const ACCEPT_EXT = /\.xlsx$/i;

export default function Dropzone({ file, onFile, invalid, accept = '.xlsx' }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0] ?? null;
    if (f && !ACCEPT_EXT.test(f.name)) {
      onFile(null);
      return;
    }
    onFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const borderColor = invalid ? 'red.400' : dragging ? 'blue.400' : 'gray.300';
  const bg = dragging ? 'blue.50' : 'gray.50';

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      borderWidth="2px"
      borderStyle="dashed"
      borderColor={borderColor}
      bg={bg}
      borderRadius="lg"
      p={8}
      cursor="pointer"
      transition="all 0.15s"
      _hover={{ borderColor: 'blue.400', bg: 'blue.50' }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Stack align="center" gap={2}>
        <Icon as={file ? FiFile : FiUploadCloud} boxSize={8} color={file ? 'green.500' : 'gray.400'} />
        {file ? (
          <>
            <Text fontWeight="medium">{file.name}</Text>
            <Text fontSize="sm" color="gray.500">
              {(file.size / 1024).toFixed(0)} KB — click to replace
            </Text>
          </>
        ) : (
          <>
            <Text fontWeight="medium">Drop your .xlsx file here</Text>
            <Text fontSize="sm" color="gray.500">
              or click to browse
            </Text>
          </>
        )}
      </Stack>
    </Box>
  );
}
