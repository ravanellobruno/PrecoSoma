import { useEffect, useState, type Ref } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { formatCents } from '@/lib/format';
import { colors } from '@/theme';

const MAX_PRICE_DIGITS = 9;
const CARET_BLINK_MS = 530;

type Props = Omit<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'keyboardType'
  | 'selection'
  | 'placeholder'
  | 'contextMenuHidden'
  | 'caretHidden'
  | 'cursorColor'
  | 'selectionColor'
  | 'style'
> & {
  cents: number;
  onChangeCents: (cents: number) => void;
  /** Box and text styles, as for a TextInput; the box applies to the field, the font to the value. */
  style?: StyleProp<TextStyle>;
  ref?: Ref<TextInput>;
};

/**
 * Price field that always shows the formatted value ("R$ 0,00" when empty) and keeps the cursor
 * at the end: only digits change it, pushing in from the right like in banking apps.
 *
 * A controlled TextInput briefly shows the raw typed text before the formatted value comes back
 * from React, which reads as a flicker. So the real input is transparent and only captures the
 * digits; the value on screen is a Text rendered from the same state, so it is never unformatted.
 */
export function PriceInput({ cents, onChangeCents, style, onFocus, onBlur, ref, ...props }: Props) {
  const text = formatCents(cents);
  const [focused, setFocused] = useState(false);

  const { color, fontSize, fontWeight, fontFamily, fontStyle, fontVariant, letterSpacing, ...box } =
    StyleSheet.flatten(style) ?? {};

  return (
    <View style={[box as ViewStyle, styles.field]}>
      <Text
        pointerEvents="none"
        numberOfLines={1}
        style={{ color, fontSize, fontWeight, fontFamily, fontStyle, fontVariant, letterSpacing }}>
        {text}
      </Text>
      {focused && <Caret height={(fontSize ?? 16) * 1.2} />}
      <TextInput
        {...props}
        ref={ref}
        style={[StyleSheet.absoluteFill, styles.hiddenInput]}
        keyboardType="number-pad"
        contextMenuHidden
        caretHidden
        cursorColor="transparent"
        selectionColor="transparent"
        accessibilityValue={{ text }}
        value={text}
        selection={{ start: text.length, end: text.length }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onChangeText={(input) => {
          const digits = input.replace(/\D/g, '').slice(0, MAX_PRICE_DIGITS);
          onChangeCents(digits ? parseInt(digits, 10) : 0);
        }}
      />
    </View>
  );
}

/** Blinking cursor after the value, since the real one is hidden along with the raw text. */
function Caret({ height }: { height: number }) {
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 0,
          delay: CARET_BLINK_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 0,
          delay: CARET_BLINK_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    blink.start();
    return () => blink.stop();
  }, [opacity]);

  return <Animated.View style={[styles.caret, { height, opacity }]} />;
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center' },
  caret: { width: 2, marginLeft: 1, borderRadius: 1, backgroundColor: colors.primary },
  // Covers the whole field to receive taps and typing, but must draw nothing. Not fully 0: iOS
  // ignores touches on views with an alpha under 0.01.
  hiddenInput: { color: 'transparent', opacity: 0.015 },
});
