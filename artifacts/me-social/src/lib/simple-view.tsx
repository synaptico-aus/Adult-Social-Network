import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type SimpleViewContextType = {
  isSimpleView: boolean;
  toggleSimpleView: () => void;
};

const SimpleViewContext = createContext<SimpleViewContextType | undefined>(undefined);

export function SimpleViewProvider({ children }: { children: ReactNode }) {
  const [isSimpleView, setIsSimpleView] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('me_simple_view');
      if (stored) {
        const parsed = JSON.parse(stored);
        return typeof parsed === 'boolean' ? parsed : false;
      }
      return false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('me_simple_view', JSON.stringify(isSimpleView));
  }, [isSimpleView]);

  const toggleSimpleView = () => setIsSimpleView((prev: boolean) => !prev);

  return (
    <SimpleViewContext.Provider value={{ isSimpleView, toggleSimpleView }}>
      {children}
    </SimpleViewContext.Provider>
  );
}

export function useSimpleView() {
  const context = useContext(SimpleViewContext);
  if (!context) throw new Error('useSimpleView must be used within SimpleViewProvider');
  return context;
}
