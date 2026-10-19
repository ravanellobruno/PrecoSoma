import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, textAlign: 'center' },
  hint: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
});
