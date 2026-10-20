import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import type { Item } from '@/db';
import { formatCents } from '@/lib/format';
import { colors, radius } from '@/theme';

const MAX_PRICE_DIGITS = 9;
const MAX_QUANTITY = 999;

type Props = {
  item: Item;
  onSave: (changes: {
    description: string | null;
    priceCents: number;
    quantity: number;
  }) => Promise<void>;
  onClose: () => void;
};

/** Edits the price, quantity and description of an item already added to a purchase. */
export function EditItemModal({ item, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [priceCents, setPriceCents] = useState(item.price_cents);
  const [quantity, setQuantity] = useState(item.quantity);
  const [description, setDescription] = useState(item.description ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving || priceCents <= 0) return;
    setSaving(true);
    try {
      await onSave({ description: description.trim() || null, priceCents, quantity });
    } catch {
      setSaving(false);
      Alert.alert('Não foi possível salvar o item', 'Tente de novo.');
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable accessibilityLabel="Fechar" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={styles.title}>Editar item</Text>

          <Text style={styles.fieldLabel}>Preço</Text>
          <View style={styles.field}>
            <TextInput
              accessibilityLabel="Preço"
              style={styles.input}
              keyboardType="number-pad"
              placeholder="R$ 0,00"
              placeholderTextColor={colors.disabled}
              value={priceCents > 0 ? formatCents(priceCents) : ''}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '').slice(0, MAX_PRICE_DIGITS);
                setPriceCents(digits ? parseInt(digits, 10) : 0);
              }}
            />
          </View>

          <Text style={styles.fieldLabel}>Quantidade</Text>
          <View style={styles.stepper}>
            <Pressable
              accessibilityLabel="Diminuir quantidade"
              style={styles.stepperButton}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}>
              <Text style={styles.stepperText}>−</Text>
            </Pressable>
            <Text style={styles.quantity}>{quantity}</Text>
            <Pressable
              accessibilityLabel="Aumentar quantidade"
              style={styles.stepperButton}
              onPress={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}>
              <Text style={styles.stepperText}>+</Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Descrição</Text>
          <View style={styles.field}>
            <TextInput
              accessibilityLabel="Descrição"
              style={styles.input}
              placeholder="Descrição (opcional)"
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              maxLength={80}
              returnKeyType="done"
            />
            {description.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apagar descrição"
                hitSlop={8}
                onPress={() => setDescription('')}>
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                  tintColor={colors.disabled}
                  size={20}
                />
              </Pressable>
            )}
          </View>

          <View style={styles.actions}>
            <Button label="Cancelar" variant="outline" onPress={onClose} style={styles.action} />
            <Button
              label={`Salvar · ${formatCents(priceCents * quantity)}`}
              disabled={saving || priceCents <= 0}
              onPress={handleSave}
              style={styles.action}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 20,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, height: '100%', fontSize: 16, color: colors.text },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepperButton: { width: 48, height: 46, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontSize: 24, color: colors.primary, fontWeight: '600' },
  quantity: {
    minWidth: 40,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 6 },
  action: { flex: 1 },
});
