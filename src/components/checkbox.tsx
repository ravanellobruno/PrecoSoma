import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

type Props = {
  /** `true` and `'mixed'` (some, not all) both render filled. */
  checked: boolean | 'mixed';
  onPress: () => void;
  label: string;
};

export function Checkbox({ checked, onPress, label }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      hitSlop={8}
      onPress={onPress}
      style={[styles.box, checked !== false && styles.boxChecked]}>
      {checked === 'mixed' ? (
        <View style={styles.dash} />
      ) : checked ? (
        <SymbolView
          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
          tintColor={colors.onPrimary}
          size={14}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
  dash: { width: 12, height: 2, borderRadius: 1, backgroundColor: colors.onPrimary },
});
