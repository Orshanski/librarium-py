import { RefObject } from "react";
import { Book, BookFormat } from "../types";

export interface BookEditOptions {
  authors: any[];
  series: any[];
  tags: any[];
  languages: string[];
  publishers: string[];
}

export interface MetadataPayload {
  title?: string;
  authors?: string;
  description?: string;
  publisher?: string;
  pubDate?: string;
  isbn?: string;
  tags?: string;
  series?: string;
  seriesNumber?: string;
  coverUrl?: string;
}

export interface BookEditFormProps {
  book: Book;
  options?: BookEditOptions;
  onSave?: (data: any) => void;
}

export interface BookEditViewProps {
  book: Book;
  title: string;
  authors: string;
  seriesName: string;
  seriesNumber: string;
  description: string;
  tags: string[];
  tagSearch: string;
  language: string;
  publisher: string;
  pubDate: string;
  isbn: string;
  formats: BookFormat[];
  showMetadataSearch: boolean;
  saving: boolean;
  uploading: boolean;
  uploadingCover: boolean;
  dragOver: boolean;
  coverUrl: string;
  seriesOptions: { value: string }[];
  languageOptions: { value: string }[];
  publisherOptions: { value: string }[];
  allTags: { name: string; bookCount: number }[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  coverInputRef: RefObject<HTMLInputElement | null>;
  onSetTitle: (value: string) => void;
  onSetAuthors: (value: string) => void;
  onSetSeriesName: (value: string) => void;
  onSetSeriesNumber: (value: string) => void;
  onSetDescription: (value: string) => void;
  onSetTagSearch: (value: string) => void;
  onAddTag: (value: string) => void;
  onRemoveTag: (value: string) => void;
  onSetLanguage: (value: string) => void;
  onSetPublisher: (value: string) => void;
  onSetPubDate: (value: string) => void;
  onSetIsbn: (value: string) => void;
  onToggleMetadataSearch: () => void;
  onApplyMetadata: (data: MetadataPayload) => Promise<void>;
  onCloseMetadataSearch: () => void;
  onChooseCover: () => void;
  onCoverInputChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onChooseFile: () => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDropFile: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDeleteFormat: (format: string) => void;
  onSaveForm: () => Promise<void>;
  onCancel: () => Promise<void>;
}
