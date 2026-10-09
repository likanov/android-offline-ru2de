import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { theme } from './theme';

type RevealContextValue = (target: View | null) => void;
const RevealContext = createContext<RevealContextValue>(() => {});

export function useQuestionInputReveal(): RevealContextValue {
  return useContext(RevealContext);
}

export function QuestionScreen({ children, onScrollTo }: React.PropsWithChildren<{ onScrollTo?: (options: { y: number; animated: boolean }) => void }>) {
  const scrollRef = useRef<ScrollView>(null);
  const targetRef = useRef<View | null>(null);
  const [keyboardOverlap, setKeyboardOverlap] = useState(0);
  const keyboardTopRef = useRef<number | null>(null);
  const scrollOffsetRef = useRef(0);
  const mountedRef = useRef(true);

  const setScrollRef = (node: ScrollView | null) => {
    scrollRef.current = node;
    // The native ScrollView always supplies scrollTo. The fallback keeps the
    // same imperative contract in the lightweight Jest host renderer.
    if (node && typeof (node as any).scrollTo !== 'function') (node as any).scrollTo = () => {};
  };

  const reveal = useCallback((target: View | null) => {
    targetRef.current = target;
    if (!target || !mountedRef.current || keyboardTopRef.current == null) return;
    // Android edge-to-edge windows can retain a full-height ScrollView under
    // the IME. Reserve the covered area so even short content can scroll.
    // Both measurements must use window coordinates (onLayout is relative).
    scrollRef.current?.getNativeScrollRef()?.measureInWindow((_, viewportY, __, viewportHeight) => {
      const keyboardTop = keyboardTopRef.current;
      if (!mountedRef.current || targetRef.current !== target || keyboardTop == null || viewportHeight <= 0) return;
      const viewportBottom = viewportY + viewportHeight;
      setKeyboardOverlap(Math.max(0, viewportBottom - keyboardTop));
      target.measureInWindow((_, y, __, height) => {
        if (!mountedRef.current || targetRef.current !== target || keyboardTopRef.current !== keyboardTop) return;
        const visibleBottom = Math.min(viewportBottom, keyboardTop) - 8;
        const visibleTop = viewportY + 8;
        let delta = 0;
        if (y + height > visibleBottom) delta = y + height - visibleBottom;
        else if (y < visibleTop) delta = y - visibleTop;
        if (!delta) return;
        // Native may clamp a request before the new content padding commits.
        // Only onScroll updates the actual offset; content layout retries below.
        const yOffset = Math.max(0, scrollOffsetRef.current + delta);
        onScrollTo?.({ y: yOffset, animated: true });
        scrollRef.current?.scrollTo({ y: yOffset, animated: true });
      });
    });
  }, [onScrollTo]);

  useEffect(() => {
    mountedRef.current = true;
    const show = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTopRef.current = event.endCoordinates?.screenY ?? null;
      if (targetRef.current) reveal(targetRef.current);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTopRef.current = null;
      setKeyboardOverlap(0);
    });
    return () => {
      mountedRef.current = false;
      show.remove();
      hide.remove();
      targetRef.current = null;
    };
  }, [reveal]);

  const reconcileLayout = () => {
    if (targetRef.current) reveal(targetRef.current);
  };

  return (
    <RevealContext.Provider value={reveal}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={setScrollRef}
          testID="screen-scroll"
          onLayout={reconcileLayout}
          onContentSizeChange={reconcileLayout}
          onScroll={event => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={100}
          contentContainerStyle={[styles.content, { paddingBottom: 16 + keyboardOverlap }]}
          style={styles.screen}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </RevealContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: theme.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, gap: 12 },
});
