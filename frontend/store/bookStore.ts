import { create } from 'zustand';
import { Book, BookMember } from '@/lib/api';

interface BookState {
  books: Book[];
  currentBookId: string | null;
  currentBookMembers: BookMember[];
  setBooks: (books: Book[]) => void;
  setCurrentBook: (id: string) => void;
  setMembers: (members: BookMember[]) => void;
  addBook: (book: Book) => void;
  currentBook: () => Book | null;
  reset: () => void;
}

export const useBookStore = create<BookState>((set, get) => ({
  books: [],
  currentBookId: null,
  currentBookMembers: [],

  setBooks: (books) => {
    set({ books });
    // 若还没选择过账本，默认选第一个
    if (!get().currentBookId && books.length > 0) {
      set({ currentBookId: books[0].id });
    }
  },

  setCurrentBook: (id) => set({ currentBookId: id }),

  setMembers: (members) => set({ currentBookMembers: members }),

  addBook: (book) => set((s) => ({
    books: [...s.books, book],
    currentBookId: s.currentBookId ?? book.id,
  })),

  currentBook: () => {
    const { books, currentBookId } = get();
    return books.find((b) => b.id === currentBookId) ?? null;
  },

  reset: () => set({ books: [], currentBookId: null, currentBookMembers: [] }),
}));
