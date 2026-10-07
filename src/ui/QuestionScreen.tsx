import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { theme } from './theme';

type Frame = { top: number; bottom: number };
type RevealContextValue = (target: View | null) => void;
const RevealContext = createContext<RevealContextValue>(() => {});

export function useQuestionInputReveal(): RevealContextValue {
  return useContext(RevealContext);
}

export function QuestionScreen({ children, onScrollTo }: React.PropsWithChildren<{ onScrollTo?: (options: { y: number; animated: boolean }) => void }>) {
  const scrollRef = useRef<ScrollView>(null);
  const targetRef = useRef<View | null>(null);
  const viewportRef = useRef<Frame>({ top: 0, bottom: 0 });
  const keyboardTopRef = useRef<number | null>(null);
  const scrollOffsetRef = useRef(0);
  const mountedRef = useRef(true);
  const lastRevealRef = useRef<string | null>(null);

  const setScrollRef = (node: ScrollView | null) => {
    scrollRef.current = node;
    // The native ScrollView always supplies scrollTo. The fallback keeps the
    // same imperative contract in the lightweight Jest host renderer.
    if (node && typeof (node as any).scrollTo !== 'function') (node as any).scrollTo = () => {};
  };

  const reveal = useCallback((target: View | null) => {
    targetRef.current = target;
    lastRevealRef.current = null;
    if (!target || !mountedRef.current) return;
    const keyboardTop = keyboardTopRef.current;
    const viewport = viewportRef.current;
    if (keyboardTop == null || viewport.bottom <= viewport.top) return;
    target.measureInWindow((_, y, __, height) => {
      if (!mountedRef.current || targetRef.current !== target) return;
      const targetTop = y;
      const targetBottom = y + height;
      const visibleBottom = Math.min(viewport.bottom, keyboardTop) - 8;
      const visibleTop = viewport.top + 8;
      let delta = 0;
      if (targetBottom > visibleBottom) delta = targetBottom - visibleBottom;
      else if (targetTop < visibleTop) delta = targetTop - visibleTop;
      if (!delta) return;
      const key = `${targetTop}:${targetBottom}:${visibleTop}:${visibleBottom}:${delta}`;
      if (lastRevealRef.current === key) return;
      lastRevealRef.current = key;
      const yOffset = Math.max(0, scrollOffsetRef.current + delta);
      scrollOffsetRef.current = yOffset;
      onScrollTo?.({ y: yOffset, animated: true });
      scrollRef.current?.scrollTo({ y: yOffset, animated: true });
    });
  }, [onScrollTo]);

  useEffect(() => {
    mountedRef.current = true;
    const show = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTopRef.current = event.endCoordinates?.screenY ?? null;
      lastRevealRef.current = null;
      if (targetRef.current) reveal(targetRef.current);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTopRef.current = null;
      lastRevealRef.current = null;
    });
    return () => {
      mountedRef.current = false;
      show.remove();
      hide.remove();
      targetRef.current = null;
    };
  }, [reveal]);

  const onLayout = (event: any) => {
    const layout = event.nativeEvent.layout;
    viewportRef.current = { top: layout.y, bottom: layout.y + layout.height };
    lastRevealRef.current = null;
    if (targetRef.current) reveal(targetRef.current);
  };

  return (
    <RevealContext.Provider value={reveal}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={setScrollRef}
          testID="screen-scroll"
          onLayout={onLayout}
          onScroll={event => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={100}
          contentContainerStyle={styles.content}
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
