import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Item } from '@/db';
import { formatCents } from '@/lib/format';
import { colors } from '@/theme';

type Props = {
  item: Item;
  /** Fallback label when the item has no description. */
  position: number;
  onDelete?: () => void;
};

export function ItemRow({ item, position, onDelete }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {item.description ?? `Item ${position}`}
        </Text>
        <Text style={styles.detail}>
          {item.quantity} × {formatCents(item.price_cents)}
        </Text>
      </View>
      <Text style={styles.subtotal}>{formatCents(item.price_cents * item.quantity)}</Text>
      {onDelete && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remover item"
          hitSlop={8}
          onPress={onDelete}
          style={styles.delete}>
          <Text style={styles.deleteText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '500', color: colors.text },
  detail: { fontSize: 14, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  subtotal: { fontSize: 16, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  delete: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 16, color: colors.textSecondary },
});
