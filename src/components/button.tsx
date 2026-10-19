import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', disabled, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'danger' && styles.danger,
        pressed && styles.pressed,
        disabled && (variant === 'primary' ? styles.primaryDisabled : styles.disabled),
        style,
      ]}>
      <Text
        style={[
          styles.label,
          variant === 'primary' && styles.labelOnPrimary,
          variant === 'outline' && styles.labelOutline,
          variant === 'danger' && styles.labelDanger,
          disabled && variant !== 'primary' && styles.labelDisabled,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: { backgroundColor: colors.primary },
  outline: { backgroundColor: colors.background, borderColor: colors.primary },
  danger: { backgroundColor: colors.background, borderColor: colors.danger },
  pressed: { opacity: 0.8 },
  primaryDisabled: { backgroundColor: colors.disabled },
  disabled: { borderColor: colors.disabled },
  label: { fontSize: 16, fontWeight: '600' },
  labelOnPrimary: { color: colors.onPrimary },
  labelOutline: { color: colors.primary },
  labelDanger: { color: colors.danger },
  labelDisabled: { color: colors.disabled },
});
