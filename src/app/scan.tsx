import { type BarcodeSettings, CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { PriceInput } from '@/components/price-input';
import { addItem } from '@/db';
import { readBarcode } from '@/lib/barcode';
import { formatCents } from '@/lib/format';
import { type Rect, type TagReading } from '@/lib/price-tag';
import { readPhoto } from '@/lib/read-photo';
import { colors, radius } from '@/theme';

type Size = { width: number; height: number };

/** `photoUri` is null when the price came from a QR code / barcode, which has no photo. */
type Result = { photoUri: string | null; reading: TagReading; code?: string };

const MAX_QUANTITY = 999;
/** Selection index of the "Outro preço" option, after the suggested prices. */
const OTHER = -1;

/** What the camera reads: the price tag by photo (OCR), a QR code or a barcode, on their own. */
type Mode = 'tag' | 'qr' | 'barcode';

const MODE_ORDER: Mode[] = ['tag', 'qr', 'barcode'];
const MODES: Record<
  Mode,
  { label: string; hint: string; noPrice: string; scanner: BarcodeSettings }
> = {
  tag: {
    label: 'Etiqueta',
    hint: 'Enquadre a etiqueta de preço',
    noPrice: '',
    scanner: { barcodeTypes: [] },
  },
  qr: {
    label: 'QR code',
    hint: 'Aponte para o QR code',
    noPrice: 'Esse QR code não tem o preço.',
    scanner: { barcodeTypes: ['qr'] },
  },
  barcode: {
    label: 'Código de barras',
    hint: 'Aponte para o código de barras',
    noPrice: 'Esse código não tem o preço. Use a opção Etiqueta.',
    scanner: { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'code128'] },
  },
};
/** How long the "code has no price" notice stays up (and ignores repeated reads of the code). */
const NOTICE_MS = 3000;

export default function ScanScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  const [view, setView] = useState<Size>({ width: 0, height: 0 });
  const [torch, setTorch] = useState(false);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // Price (in cents) picked from the result; opens the modal to finish the item.
  const [picked, setPicked] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('tag');
  const [notice, setNotice] = useState<string | null>(null);
  // The scanner fires repeatedly while a code stays in view; handle each scan once.
  const scanned = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  if (!permission) return <View style={styles.camera} />;

  if (!permission.granted) {
    return (
      <View
        style={[
          styles.permission,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
        ]}>
        <View style={styles.permissionText}>
          <Text style={styles.title}>Permitir acesso à câmera</Text>
          <Text style={styles.body}>
            O PreçoSoma usa a câmera para ler o preço na etiqueta. A leitura é feita no próprio
            aparelho e a foto não é enviada para lugar nenhum.
          </Text>
        </View>
        {permission.canAskAgain ? (
          <Button label="Permitir câmera" onPress={requestPermission} />
        ) : (
          <Button label="Abrir ajustes" onPress={() => Linking.openSettings()} />
        )}
        <Button label="Cancelar" variant="outline" onPress={() => router.back()} />
      </View>
    );
  }

  const guide = guideRect(view, mode);

  async function capture() {
    if (reading || !camera.current) return;
    setReading(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8 });
      const region = view.width > 0 ? toPhotoRect(guide, view, photo) : undefined;
      setResult({ photoUri: photo.uri, reading: await readPhoto(photo, region) });
    } catch {
      Alert.alert('Não foi possível ler a etiqueta', 'Tente de novo ou digite o preço.');
    } finally {
      setReading(false);
    }
  }

  function handleBarcode({ type, data }: { type: string; data: string }) {
    if (scanned.current || reading || notice) return;
    const barcodeReading = readBarcode(type, data);
    if (barcodeReading.candidates.length > 0) {
      scanned.current = true;
      setResult({ photoUri: null, reading: barcodeReading, code: data });
      return;
    }
    // Most barcodes only identify the product; keep scanning instead of interrupting.
    setNotice(MODES[mode].noPrice);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }

  function changeMode(next: Mode) {
    clearTimeout(noticeTimer.current);
    setNotice(null);
    setMode(next);
  }

  function retry() {
    scanned.current = false;
    setResult(null);
  }

  async function add(item: { description: string | null; quantity: number }) {
    if (picked === null) return;
    await addItem(db, { ...item, priceCents: picked });
    // The purchase screen reloads its items when it regains focus.
    router.dismissTo('/');
  }

  return (
    <View style={styles.camera} onLayout={(e) => setView(e.nativeEvent.layout)}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        active={!result}
        enableTorch={torch}
        barcodeScannerSettings={MODES[mode].scanner}
        onBarcodeScanned={mode === 'tag' || result || reading ? undefined : handleBarcode}
      />

      {/* Dims everything outside the guide. */}
      {view.width > 0 && (
        <>
          <View style={[styles.shade, { top: 0, height: guide.top, left: 0, right: 0 }]} />
          <View style={[styles.shade, { top: guide.bottom, bottom: 0, left: 0, right: 0 }]} />
          <View
            style={[
              styles.shade,
              { top: guide.top, height: guide.bottom - guide.top, left: 0, width: guide.left },
            ]}
          />
          <View
            style={[
              styles.shade,
              { top: guide.top, height: guide.bottom - guide.top, left: guide.right, right: 0 },
            ]}
          />
          <View
            style={[
              styles.guide,
              {
                top: guide.top,
                left: guide.left,
                width: guide.right - guide.left,
                height: guide.bottom - guide.top,
              },
            ]}
          />
          <Text style={[styles.hint, { top: guide.bottom + 16 }]}>
            {reading ? 'Lendo etiqueta…' : (notice ?? MODES[mode].hint)}
          </Text>
        </>
      )}

      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <Text style={styles.topBarText}>Cancelar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={torch ? 'Desligar lanterna' : 'Ligar lanterna'}
          hitSlop={8}
          onPress={() => setTorch((on) => !on)}>
          <SymbolView
            name={
              torch
                ? { ios: 'flashlight.on.fill', android: 'flashlight_on', web: 'flashlight_on' }
                : { ios: 'flashlight.off.fill', android: 'flashlight_off', web: 'flashlight_off' }
            }
            tintColor="#FFFFFF"
            size={26}
          />
        </Pressable>
      </View>

      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        {mode === 'tag' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ler preço"
            accessibilityState={{ disabled: reading }}
            disabled={reading}
            onPress={capture}
            style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}>
            {reading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </Pressable>
        )}
        <View style={styles.modes}>
          {MODE_ORDER.map((option) => {
            const selected = option === mode;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: reading }}
                disabled={reading}
                onPress={() => changeMode(option)}
                style={[styles.modeButton, selected && styles.modeButtonSelected]}>
                <Text style={[styles.modeText, selected && styles.modeTextSelected]}>
                  {MODES[option].label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {result && (
        <ResultSheet
          result={result}
          bottomInset={insets.bottom}
          onPick={setPicked}
          onRetry={retry}
        />
      )}

      {result && picked !== null && (
        <AddItemModal
          priceCents={picked}
          bottomInset={insets.bottom}
          onAdd={add}
          onClose={() => setPicked(null)}
        />
      )}
    </View>
  );
}

function ResultSheet({
  result,
  bottomInset,
  onPick,
  onRetry,
}: {
  result: Result;
  bottomInset: number;
  onPick: (cents: number) => void;
  onRetry: () => void;
}) {
  const { candidates } = result.reading;
  const [selected, setSelected] = useState(0);
  const [customCents, setCustomCents] = useState(0);
  const customInput = useRef<TextInput>(null);

  const cents = selected === OTHER ? customCents : (candidates[selected]?.cents ?? 0);

  function selectOther() {
    setSelected(OTHER);
    customInput.current?.focus();
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[StyleSheet.absoluteFill, styles.result]}>
      {result.photoUri ? (
        <Image source={{ uri: result.photoUri }} style={styles.photo} contentFit="cover" />
      ) : (
        <View style={[styles.photo, styles.codePreview]}>
          <SymbolView
            name={{ ios: 'qrcode.viewfinder', android: 'qr_code_scanner', web: 'qr_code_scanner' }}
            tintColor="#FFFFFF"
            size={56}
          />
          <Text style={styles.codeText} numberOfLines={3}>
            {result.code}
          </Text>
        </View>
      )}
      <View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 16) }]}>
        {candidates.length > 0 ? (
          <>
            <Text style={styles.title}>
              {result.photoUri ? 'Qual preço você quer adicionar?' : 'Preço encontrado no código'}
            </Text>
            <ScrollView
              style={styles.options}
              contentContainerStyle={styles.optionsContent}
              keyboardShouldPersistTaps="handled">
              {candidates.map((candidate, index) => {
                const checked = index === selected;
                return (
                  <Pressable
                    key={candidate.cents}
                    accessibilityRole="radio"
                    accessibilityState={{ checked }}
                    onPress={() => setSelected(index)}
                    style={[styles.option, checked && styles.optionChecked]}>
                    <Radio checked={checked} />
                    <Text style={styles.optionValue}>{formatCents(candidate.cents)}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected === OTHER }}
                onPress={selectOther}
                style={[styles.option, selected === OTHER && styles.optionChecked]}>
                <Radio checked={selected === OTHER} />
                <Text style={styles.optionValue}>Outro preço:</Text>
                <PriceInput
                  ref={customInput}
                  accessibilityLabel="Outro preço"
                  style={styles.customInput}
                  cents={customCents}
                  onChangeCents={setCustomCents}
                  onFocus={() => setSelected(OTHER)}
                />
              </Pressable>
            </ScrollView>
            <View style={styles.actions}>
              <Button
                label={result.photoUri ? 'Tirar outra foto' : 'Ler de novo'}
                variant="outline"
                onPress={onRetry}
                style={styles.action}
              />
              <Button
                label="Confirmar preço"
                disabled={cents <= 0}
                onPress={() => onPick(cents)}
                style={styles.action}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>Nenhum preço encontrado</Text>
            <Text style={styles.body}>Aproxime a câmera da etiqueta e tente de novo.</Text>
            <View style={styles.actions}>
              <Button
                label="Digitar preço"
                variant="outline"
                onPress={() =>
                  router.dismissTo({ pathname: '/', params: { focusPrice: String(Date.now()) } })
                }
                style={styles.action}
              />
              <Button label="Tentar de novo" onPress={onRetry} style={styles.action} />
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.radio, checked && styles.radioChecked]}>
      {checked && <View style={styles.radioDot} />}
    </View>
  );
}

/** Finishes the item for the picked price: quantity and an optional product name. */
function AddItemModal({
  priceCents,
  bottomInset,
  onAdd,
  onClose,
}: {
  priceCents: number;
  bottomInset: number;
  onAdd: (item: { description: string | null; quantity: number }) => Promise<void>;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (saving) return;
    setSaving(true);
    try {
      await onAdd({ description: description.trim() || null, quantity });
    } catch {
      setSaving(false);
      Alert.alert('Não foi possível adicionar o item', 'Tente de novo.');
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.modalBackdrop}>
        <Pressable
          accessibilityLabel="Fechar"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 16) }]}>
          <Text style={styles.selectedValue}>{formatCents(priceCents)}</Text>

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
          <View style={styles.nameField}>
            <TextInput
              accessibilityLabel="Descrição"
              style={styles.nameInput}
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
            <Button label="Voltar" variant="outline" onPress={onClose} style={styles.action} />
            <Button
              label={`Adicionar · ${formatCents(priceCents * quantity)}`}
              disabled={saving}
              onPress={handleAdd}
              style={styles.action}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Area the user frames the tag in, in screen coordinates. */
function guideRect(view: Size, mode: Mode): Rect {
  const width = mode === 'qr' ? Math.min(view.width - 96, 280) : Math.min(view.width - 48, 420);
  const height = mode === 'qr' ? width : width * (mode === 'barcode' ? 0.4 : 0.7);
  const top = Math.max(0, view.height * 0.4 - height / 2);
  const left = (view.width - width) / 2;
  return { left, top, right: left + width, bottom: top + height };
}

/**
 * Maps the guide to photo pixels (where OCR frames live), with some margin. The preview fills
 * the screen like `cover`, so the photo is scaled up and cropped on the sides.
 */
function toPhotoRect(guide: Rect, view: Size, photo: Size): Rect {
  const scale = Math.max(view.width / photo.width, view.height / photo.height);
  const offsetX = (view.width - photo.width * scale) / 2;
  const offsetY = (view.height - photo.height * scale) / 2;
  const margin = (guide.right - guide.left) * 0.1;
  return {
    left: (guide.left - margin - offsetX) / scale,
    top: (guide.top - margin - offsetY) / scale,
    right: (guide.right + margin - offsetX) / scale,
    bottom: (guide.bottom + margin - offsetY) / scale,
  };
}

const styles = StyleSheet.create({
  camera: { flex: 1, backgroundColor: '#000000' },
  shade: { position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  guide: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: radius.lg,
  },
  hint: {
    position: 'absolute',
    left: 16,
    right: 16,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarText: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  bottomArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 20,
  },
  modes: { flexDirection: 'row', gap: 8 },
  modeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modeButtonSelected: { backgroundColor: '#FFFFFF' },
  modeText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  modeTextSelected: { color: colors.text },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  shutterPressed: { opacity: 0.7 },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },

  permission: {
    flex: 1,
    gap: 10,
    paddingHorizontal: 16,
    justifyContent: 'flex-end',
    backgroundColor: colors.background,
  },
  permissionText: { flex: 1, gap: 8, justifyContent: 'center' },

  result: { backgroundColor: '#000000' },
  photo: { flex: 1 },
  codePreview: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  codeText: {
    fontSize: 15,
    textAlign: 'center',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  sheet: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 20,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.background,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 22, color: colors.textSecondary },
  options: { flexGrow: 0, maxHeight: 280 },
  optionsContent: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionChecked: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioChecked: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  customInput: {
    flex: 1,
    height: '100%',
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  optionValue: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  selectedValue: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 6 },
  action: { flex: 1 },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  nameField: {
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
  nameInput: { flex: 1, height: '100%', fontSize: 16, color: colors.text },
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
});
