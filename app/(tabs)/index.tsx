import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

// ─── IMPORTANT: replace with YOUR local IP (run: ipconfig getifaddr en0) ───
const API_URL      = 'https://kova-backend-p02n.onrender.com/analyze';
const REFINE_URL   = 'https://kova-backend-p02n.onrender.com/refine';
const CONTINUE_URL = 'https://kova-backend-p02n.onrender.com/continue';
const OCR_URL      = 'https://kova-backend-p02n.onrender.com/ocr';
// ────────────────────────────────────────────────────────────────────────────

type Stage = 'idle' | 'selecting' | 'locked' | 'analyzing' | 'done';

type SelectionBox = { x: number; y: number; width: number; height: number };

type Result = {
  whatTheySaid?: string;
  whatTheyMean?: string;
  summary: string;
  whatThisReallyMeans: string;
  impactLine: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  riskRead: string;
  whatToDo: string[];
  sayThis: { native: string; english: string; tone?: string };
  whatTheyWant: string;
  redFlag: boolean;
  redFlagTitle: string;
  redFlagReason: string;
  redFlagConsequence: string;
  redFlagAction: string[];
  longGame: { scenario: string; action: string; reply: string }[];
};

const ACCENT = '#5252CC';

// ── Refine button with press animation ────────────────────────────────────────

function RefineButton({
  label, onPress, disabled, dim, outerStyle,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  dim?: boolean;
  outerStyle?: object;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.timing(scale, { toValue: 0.92, duration: 120, useNativeDriver: true }).start();
  const pressOut = () => Animated.timing(scale, { toValue: 1,    duration: 150, useNativeDriver: true }).start();
  const handlePress = () => {
    console.log('BUTTON PRESSED');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };
  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      activeOpacity={1}
      style={outerStyle}
    >
      <Animated.View style={[
        s.refineChip,
        dim  && s.refineChipDim,
        disabled && s.refineChipDisabled,
        { transform: [{ scale }] },
      ]}>
        <Text style={[s.refineChipText, dim && s.refineChipTextDim]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const [stage,             setStage]            = useState<Stage>('idle');
  const [result,            setResult]           = useState<Result | null>(null);
  const [copied,            setCopied]           = useState(false);
  const [imageUri,          setImageUri]         = useState<string | null>(null);
  const [base64Data,        setBase64Data]       = useState<string | null>(null);
  const [resizedUri,        setResizedUri]       = useState<string | null>(null);
  const [resizedImgH,       setResizedImgH]      = useState(0);
  const [imgNatW,           setImgNatW]          = useState(0);
  const [imgNatH,           setImgNatH]          = useState(0);
  const [overlayW,          setOverlayW]         = useState(Dimensions.get('window').width);
  const [overlayH,          setOverlayH]         = useState(Dimensions.get('window').height);
  const [selBoxVisible,       setSelBoxVisible]      = useState(false);
  const [croppedBase64,       setCroppedBase64]     = useState<string | null>(null);
  const [selectedMessageText, setSelectedMessageText] = useState<string | null>(null);
  const [isOcrProcessing,     setIsOcrProcessing]   = useState(false);
  const [displayReply,      setDisplayReply]     = useState<{ native: string; english: string } | null>(null);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [isRefining,        setIsRefining]       = useState(false);
  const [refineOpen,        setRefineOpen]       = useState(false);
  const [continueOpen,      setContinueOpen]     = useState(false);
  const [continueMessage,   setContinueMessage]  = useState('');
  const [isContinuing,      setIsContinuing]     = useState(false);
  const [zoneWidth,         setZoneWidth]        = useState(300);
  const [zoneHeight,        setZoneHeight]       = useState(210);
  const [cropFailed,        setCropFailed]       = useState(false);

  // Refs
  const stageRef           = useRef<Stage>('idle');
  const selectionStartRef  = useRef<{ x: number; y: number } | null>(null);
  const selectionBoxRef    = useRef<SelectionBox | null>(null);
  const cropSelectionRef   = useRef<(box: SelectionBox) => void>(() => {});
  const cropTimeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef      = useRef<ScrollView>(null);
  const refineInputRef     = useRef<TextInput>(null);
  const continueInputRef   = useRef<TextInput>(null);

  // Animations
  const cardRevealAnim      = useRef(new Animated.Value(0)).current;
  const replyTransitionAnim = useRef(new Animated.Value(1)).current;
  const replyScaleAnim      = useRef(new Animated.Value(1)).current;
  const refineFlashAnim     = useRef(new Animated.Value(0)).current;
  const refineDotAnim       = useRef(new Animated.Value(0)).current;
  const toneAnim            = useRef(new Animated.Value(0)).current;
  const refineAnim          = useRef(new Animated.Value(0)).current;
  const sayThisAnim         = useRef(new Animated.Value(0)).current;
  const redFlagAnim         = useRef(new Animated.Value(0)).current;
  const redFlagPulse        = useRef(new Animated.Value(1)).current;
  const longGameAnim        = useRef(new Animated.Value(0)).current;
  const pulseAnim           = useRef(new Animated.Value(1)).current;
  const glowAnim            = useRef(new Animated.Value(0)).current;
  const pressAnim           = useRef(new Animated.Value(0)).current;
  const resultsAnim         = useRef(new Animated.Value(0)).current;
  const dotScale            = useRef(new Animated.Value(1)).current;
  const dotOpacity          = useRef(new Animated.Value(0.7)).current;
  const panelAnim           = useRef(new Animated.Value(0)).current;
  const shimmerAnim         = useRef(new Animated.Value(0)).current;
  const selGlowAnim         = useRef(new Animated.Value(0)).current;
  const selBoxX             = useRef(new Animated.Value(0)).current;
  const selBoxY             = useRef(new Animated.Value(0)).current;
  const selBoxW             = useRef(new Animated.Value(0)).current;
  const selBoxH             = useRef(new Animated.Value(0)).current;
  const selBoxAlpha         = useRef(new Animated.Value(0)).current;
  const imgTouchAlpha       = useRef(new Animated.Value(0)).current;
  const pulseLoop           = useRef<Animated.CompositeAnimation | null>(null);
  const dotLoop             = useRef<Animated.CompositeAnimation | null>(null);
  const shimmerLoop         = useRef<Animated.CompositeAnimation | null>(null);
  const refineDotLoop       = useRef<Animated.CompositeAnimation | null>(null);
  const selGlowLoop         = useRef<Animated.CompositeAnimation | null>(null);

  // Keep stageRef in sync so PanResponder callbacks don't read stale closure
  useEffect(() => { stageRef.current = stage; }, [stage]);

  useEffect(() => {
    if (stage === 'done') {
      console.log('RESULT ANIMATION RUNNING');
      resultsAnim.setValue(0);
      redFlagAnim.setValue(0);
      Animated.timing(resultsAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      setTimeout(() => Animated.timing(redFlagAnim,  { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(), 80);
      setTimeout(() => Animated.timing(sayThisAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(), 120);
      setTimeout(() => Animated.timing(toneAnim,    { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(), 200);
      setTimeout(() => Animated.timing(refineAnim,   { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(), 300);
      setTimeout(() => Animated.timing(longGameAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(), 450);
    }
  }, [stage]);

  useEffect(() => {
    if (result?.redFlag === true) {
      setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Animated.sequence([
          Animated.timing(redFlagPulse, { toValue: 1.03, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(redFlagPulse, { toValue: 1,    duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
      }, 380); // fires after redFlagAnim finishes (80ms delay + 300ms duration)
    }
  }, [result]);

  const handlePressIn = () => {
    Animated.timing(pressAnim, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.timing(pressAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  };

  const startAnalyzingAnimations = () => {
    Animated.timing(glowAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.28, duration: 850, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 850, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();

    // Shimmer sweep across the selection box
    shimmerAnim.setValue(0);
    shimmerLoop.current = Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
    );
    shimmerLoop.current.start();

    // Slow glow pulse on the selection border
    selGlowAnim.setValue(0.2);
    selGlowLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(selGlowAnim, { toValue: 1,   duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(selGlowAnim, { toValue: 0.2, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    selGlowLoop.current.start();
  };

  const startDotPulse = () => {
    dotLoop.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(dotScale,   { toValue: 1.35, duration: 1100, useNativeDriver: true }),
          Animated.timing(dotOpacity, { toValue: 1,    duration: 1100, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(dotScale,   { toValue: 1,    duration: 1100, useNativeDriver: true }),
          Animated.timing(dotOpacity, { toValue: 0.45, duration: 1100, useNativeDriver: true }),
        ]),
      ])
    );
    dotLoop.current.start();
  };

  const stopAnalyzingAnimations = () => {
    pulseLoop.current?.stop();
    shimmerLoop.current?.stop();
    selGlowLoop.current?.stop();
    pulseAnim.setValue(1);
    shimmerAnim.setValue(0);
    selGlowAnim.setValue(0);
  };

  // Returns rendered image layout within the overlay (aspect-fit)
  const getImageLayout = () => {
    const containerAspect = overlayW / overlayH;
    const imageAspect     = imgNatW / imgNatH;
    let imgW: number, imgH: number, offX: number, offY: number;
    if (imageAspect > containerAspect) {
      imgW = overlayW; imgH = overlayW / imageAspect;
      offX = 0;        offY = (overlayH - imgH) / 2;
    } else {
      imgH = overlayH; imgW = overlayH * imageAspect;
      offX = (overlayW - imgW) / 2; offY = 0;
    }
    return { imgW, imgH, offX, offY };
  };

  // Converts screen selection box → crop coords on the resized (800px) image
  const boxToResizedCrop = (box: SelectionBox) => {
    const { imgW, imgH, offX, offY } = getImageLayout();
    const clampX1 = Math.max(offX, Math.min(offX + imgW, box.x));
    const clampY1 = Math.max(offY, Math.min(offY + imgH, box.y));
    const clampX2 = Math.max(offX, Math.min(offX + imgW, box.x + box.width));
    const clampY2 = Math.max(offY, Math.min(offY + imgH, box.y + box.height));
    return {
      originX: Math.round((clampX1 - offX) / imgW * 800),
      originY: Math.round((clampY1 - offY) / imgH * resizedImgH),
      width:   Math.max(1, Math.round((clampX2 - clampX1) / imgW * 800)),
      height:  Math.max(1, Math.round((clampY2 - clampY1) / imgH * resizedImgH)),
    };
  };

  // Run OCR on a cropped base64 image and store the extracted text
  const runOcrOnCrop = async (base64: string) => {
    setIsOcrProcessing(true);
    setSelectedMessageText(null);
    try {
      const response = await fetch(OCR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.text?.trim()) setSelectedMessageText(data.text.trim());
      }
    } catch {
      console.log('[OCR] failed — will fall back to image');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // Crop the current selectionBox, store result, then run OCR
  const cropSelection = async (box: SelectionBox) => {
    console.log('[CROP] START', { resizedUri: !!resizedUri, resizedImgH, imgNatW });
    if (!resizedUri || resizedImgH === 0 || !imgNatW) {
      console.log('[CROP] ABORTED — missing layout data');
      return;
    }
    try {
      const coords = boxToResizedCrop(box);
      const crop = await ImageManipulator.manipulateAsync(
        resizedUri,
        [{ crop: { originX: coords.originX, originY: coords.originY, width: coords.width, height: coords.height } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!crop.base64) throw new Error('ImageManipulator returned no base64');
      console.log('[CROP] DONE', crop.base64.length);
      if (cropTimeoutRef.current) { clearTimeout(cropTimeoutRef.current); cropTimeoutRef.current = null; }
      setCroppedBase64(crop.base64);
      // OCR starts immediately in parallel — usually done before user taps Continue
      runOcrOnCrop(crop.base64);
    } catch (err) {
      console.log('[CROP] ERROR', err);
      /* if crop fails, user can still adjust */
    }
  };
  // Keep ref current so PanResponder (created once) always calls the latest version
  useEffect(() => { cropSelectionRef.current = cropSelection; });

  // PanResponder — drag to draw selection
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => stageRef.current === 'selecting',
    onMoveShouldSetPanResponder:  () => stageRef.current === 'selecting',

    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      selectionStartRef.current = { x: locationX, y: locationY };
      selBoxX.setValue(locationX);
      selBoxY.setValue(locationY);
      selBoxW.setValue(0);
      selBoxH.setValue(0);
      selBoxAlpha.setValue(0);
      setCroppedBase64(null);
      setSelectedMessageText(null);
      setSelBoxVisible(true);
      Animated.timing(selBoxAlpha, { toValue: 1, duration: 80, useNativeDriver: false }).start();
      Animated.timing(imgTouchAlpha, { toValue: 0.55, duration: 120, useNativeDriver: true }).start();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },

    onPanResponderMove: (_evt, gestureState) => {
      const start = selectionStartRef.current;
      if (!start) return;
      selBoxX.setValue(start.x + Math.min(0, gestureState.dx));
      selBoxY.setValue(start.y + Math.min(0, gestureState.dy));
      selBoxW.setValue(Math.abs(gestureState.dx));
      selBoxH.setValue(Math.abs(gestureState.dy));
    },

    onPanResponderRelease: (_evt, gestureState) => {
      if (Math.abs(gestureState.dx) < 20 || Math.abs(gestureState.dy) < 10) {
        setSelBoxVisible(false);
        selectionStartRef.current = null;
        Animated.timing(imgTouchAlpha, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const start = selectionStartRef.current!;
      const snapPad = 3;
      const finalBox: SelectionBox = {
        x:      start.x + Math.min(0, gestureState.dx) + snapPad,
        y:      start.y + Math.min(0, gestureState.dy) + snapPad,
        width:  Math.abs(gestureState.dx) - snapPad * 2,
        height: Math.abs(gestureState.dy) - snapPad * 2,
      };

      // Snap animation — snug inward on release
      Animated.parallel([
        Animated.timing(selBoxX, { toValue: finalBox.x,      duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(selBoxY, { toValue: finalBox.y,      duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(selBoxW, { toValue: finalBox.width,  duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(selBoxH, { toValue: finalBox.height, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]).start();

      Animated.timing(imgTouchAlpha, { toValue: 0, duration: 300, useNativeDriver: true }).start();

      selectionBoxRef.current = finalBox;
      selectionStartRef.current = null;

      panelAnim.setValue(0);
      Animated.timing(panelAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();

      setCropFailed(false);
      if (cropTimeoutRef.current) clearTimeout(cropTimeoutRef.current);
      cropTimeoutRef.current = setTimeout(() => {
        setCropFailed(true);
      }, 4000);
      setStage('locked');
      cropSelectionRef.current(finalBox);
    },

    onPanResponderTerminate: () => {
      setSelBoxVisible(false);
      selectionStartRef.current = null;
      Animated.timing(imgTouchAlpha, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    },
  })).current;

  // Stage: idle → open picker, resize, show selection overlay
  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Kova needs access to your photos to analyse a screenshot.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: false,
      quality: 0.5,
    });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    const uri = picked.assets[0].uri;
    setImageUri(uri);
    setStage('selecting');

    // Resize in background
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    setBase64Data(manipulated.base64!);
    setResizedUri(manipulated.uri);
    setResizedImgH(manipulated.height);
  };

  // User confirms selection → analyze
  const handleConfirm = async () => {
    if (!croppedBase64) return;

    Animated.parallel([
      Animated.timing(panelAnim,   { toValue: 0, duration: 130, useNativeDriver: true }),
      Animated.timing(selBoxAlpha, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start(() => setSelBoxVisible(false));
    setStage('analyzing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    startAnalyzingAnimations();

    cardRevealAnim.setValue(0);
    Animated.timing(cardRevealAnim, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

    // Prefer extracted text; fall back to image if OCR failed
    const body = selectedMessageText
      ? { image: base64Data, selectedMessage: selectedMessageText }
      : { image: base64Data, selectedMessageImage: croppedBase64 };
    console.log('[ANALYZE] SENDING REQUEST', { hasText: !!selectedMessageText, hasImage: !!croppedBase64 });

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data: Result = await response.json();
      stopAnalyzingAnimations();
      glowAnim.setValue(1);
      setResult(data);
      setDisplayReply(data.sayThis);
      replyTransitionAnim.setValue(1);
      resultsAnim.setValue(0);
      redFlagAnim.setValue(0);
      longGameAnim.setValue(0);
      toneAnim.setValue(0);
      refineAnim.setValue(0);
      sayThisAnim.setValue(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStage('done');
      startDotPulse();
    } catch (err) {
      stopAnalyzingAnimations();
      glowAnim.setValue(0);
      setStage('selecting');
      Alert.alert('Could not connect', 'Check your connection and try again.');
    }
  };

  // User wants to adjust their selection
  const handleAdjustSelection = () => {
    if (cropTimeoutRef.current) { clearTimeout(cropTimeoutRef.current); cropTimeoutRef.current = null; }
    setCropFailed(false);
    Animated.timing(panelAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setSelBoxVisible(false);
      selBoxAlpha.setValue(0);
      setCroppedBase64(null);
      setSelectedMessageText(null);
      setIsOcrProcessing(false);
      setStage('selecting');
    });
  };

  // Pure rewrite — sends ONLY the current reply + instruction, no analysis context
  const rewriteReply = async (native: string, instruction: string): Promise<{ native: string; english: string } | null> => {
    const response = await fetch(REFINE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ native, instruction }),
    });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    return response.json();
  };

  const handleRefine = async (instruction: string) => {
    if (isRefining || !displayReply) return;
    setIsRefining(true);

    // Start dot pulse animation
    refineDotLoop.current?.stop();
    refineDotAnim.setValue(0);
    refineDotLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(refineDotAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(refineDotAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    );
    refineDotLoop.current.start();

    // Dim + scale down
    Animated.parallel([
      Animated.timing(replyTransitionAnim, { toValue: 0.4, duration: 120, useNativeDriver: true }),
      Animated.timing(replyScaleAnim, { toValue: 0.98, duration: 120, useNativeDriver: true }),
    ]).start();

    const restoreToIdle = () => {
      refineDotLoop.current?.stop();
      Animated.parallel([
        Animated.timing(replyTransitionAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(replyScaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start(() => setIsRefining(false));
    };

    try {
      const data = await rewriteReply(displayReply.native, instruction);
      if (data) {
        refineDotLoop.current?.stop();
        // Fade out + shrink
        await new Promise<void>(resolve =>
          Animated.parallel([
            Animated.timing(replyTransitionAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(replyScaleAnim, { toValue: 0.97, duration: 200, useNativeDriver: true }),
          ]).start(() => resolve())
        );
        setDisplayReply(data);
        setIsRefining(false);
        // Fade in + restore scale
        replyTransitionAnim.setValue(0);
        replyScaleAnim.setValue(0.97);
        await new Promise<void>(resolve =>
          Animated.parallel([
            Animated.timing(replyTransitionAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(replyScaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]).start(() => resolve())
        );
        // Flash confirmation
        refineFlashAnim.setValue(1);
        Animated.timing(refineFlashAnim, { toValue: 0, duration: 600, useNativeDriver: true }).start();
        return;
      }
    } catch { /* fall through */ }

    restoreToIdle();
  };

  const handleContinue = async (newMessage: string) => {
    if (isContinuing || !result || !displayReply) return;
    setIsContinuing(true);
    setContinueMessage('');

    try {
      const response = await fetch(CONTINUE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previousMessage: result.whatTheySaid || result.summary || '',
          previousReply: displayReply.native,
          previousAnalysis: {
            riskLevel: result.riskLevel,
            riskRead: result.riskRead,
            summary: result.summary,
            whatThisReallyMeans: result.whatThisReallyMeans,
            whatToDo: result.whatToDo,
          },
          newMessage,
        }),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();

      // Update result fields in place — do NOT reset the screen
      setResult(prev => prev ? {
        ...prev,
        riskLevel: data.riskLevel ?? prev.riskLevel,
        riskRead: data.riskRead ?? prev.riskRead,
        whatToDo: data.whatToDo?.length ? data.whatToDo : prev.whatToDo,
        summary: data.update ?? prev.summary,
        whatThisReallyMeans: data.update ?? prev.whatThisReallyMeans,
      } : prev);

      // Fade out → swap reply → fade in
      await new Promise<void>(resolve =>
        Animated.timing(replyTransitionAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => resolve())
      );
      setDisplayReply(data.sayThis);
      Animated.timing(replyTransitionAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();

      setContinueOpen(false);
    } catch {
      // silent — keep input open
    } finally {
      setIsContinuing(false);
    }
  };

  const handleReset = () => {
    dotLoop.current?.stop();
    pulseLoop.current?.stop();
    shimmerLoop.current?.stop();
    selGlowLoop.current?.stop();
    refineDotLoop.current?.stop();
    dotScale.setValue(1);
    dotOpacity.setValue(0.7);
    resultsAnim.setValue(0);
    pulseAnim.setValue(1);
    glowAnim.setValue(0);
    cardRevealAnim.setValue(0);
    replyTransitionAnim.setValue(1);
    replyScaleAnim.setValue(1);
    refineFlashAnim.setValue(0);
    refineDotAnim.setValue(0);
    toneAnim.setValue(0);
    refineAnim.setValue(0);
    sayThisAnim.setValue(0);
    redFlagAnim.setValue(0);
    redFlagPulse.setValue(1);
    longGameAnim.setValue(0);
    if (cropTimeoutRef.current) { clearTimeout(cropTimeoutRef.current); cropTimeoutRef.current = null; }
    setCropFailed(false);
    panelAnim.setValue(0);
    shimmerAnim.setValue(0);
    selGlowAnim.setValue(0);
    selBoxX.setValue(0);
    selBoxY.setValue(0);
    selBoxW.setValue(0);
    selBoxH.setValue(0);
    selBoxAlpha.setValue(0);
    imgTouchAlpha.setValue(0);
    setSelBoxVisible(false);
    setResult(null);
    setDisplayReply(null);
    setRefineInstruction('');
    setIsRefining(false);
    setRefineOpen(false);
    setContinueOpen(false);
    setContinueMessage('');
    setIsContinuing(false);
    setCopied(false);
    setImageUri(null);
    setBase64Data(null);
    setResizedUri(null);
    setResizedImgH(0);
    setImgNatW(0);
    setImgNatH(0);
    setCroppedBase64(null);
    setSelectedMessageText(null);
    setIsOcrProcessing(false);
    selectionStartRef.current = null;
    setStage('idle');
  };

  const handleCopy = async () => {
    if (!displayReply) return;
    await Clipboard.setStringAsync(displayReply.native);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isSelecting = stage === 'selecting';
  const isLocked    = stage === 'locked';
  const isAnalyzing = stage === 'analyzing';
  const isDone      = stage === 'done';

  const riskColor =
    result?.riskLevel === 'High'   ? '#E05555' :
    result?.riskLevel === 'Medium' ? '#D4924A' :
    '#4CAF7D';

  return (
    <LinearGradient
      colors={['#0D0D16', '#080809', '#060607']}
      locations={[0, 0.5, 1]}
      style={s.root}
    >
      <LinearGradient
        colors={['rgba(55,55,110,0.10)', 'transparent']}
        style={s.topLight}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        style={s.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[s.scroll, (refineOpen || continueOpen) && isDone ? { paddingBottom: 240 } : undefined]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={isDone}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >

          {/* ── UPLOAD SCREEN (idle only) ── */}
          {stage === 'idle' && (
            <>
              <View style={s.topCopy}>
                <Text style={s.wordmark}>Kova</Text>
                <Text style={s.headline}>What's actually{'\n'}going on here?</Text>
                <Text style={s.subheadline}>
                  I'll tell you what they mean, how serious it is, and exactly what to say.
                </Text>
              </View>

              <Text style={s.tensionLine}>Something feels off?</Text>

              <View style={s.uploadWrapper}>
                <Animated.View style={[s.glowRingIdle, { opacity: pressAnim }]} />
                <Animated.View style={[s.glowRing,     { opacity: glowAnim  }]} />
                <TouchableOpacity
                  style={s.uploadZone}
                  activeOpacity={1}
                  onPress={handlePickImage}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  onLayout={(e) => {
                    setZoneHeight(e.nativeEvent.layout.height);
                    setZoneWidth(e.nativeEvent.layout.width);
                  }}
                >
                  <LinearGradient
                    colors={['#20203C', '#141428']}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                  />
                  <View style={s.zoneTopHighlight} />
                  <View style={s.zoneInner}>
                    <View style={s.iconWrap}>
                      <View style={s.iconDoc}>
                        <View style={s.iconDocLine} />
                        <View style={[s.iconDocLine, s.iconDocLineShort]} />
                        <View style={[s.iconDocLine, s.iconDocLineMid]} />
                      </View>
                      <View style={s.iconLens} />
                      <View style={s.iconLensHandle} />
                    </View>
                    <Text style={s.zonePrimary}>Upload a screenshot</Text>
                    <Text style={s.zoneSecondary}>Messages, emails, or anything unclear</Text>
                    <View style={s.zoneTypeRow}>
                      <Text style={s.zoneTypeItem}>Paste</Text>
                      <Text style={s.zoneTypeDot}>·</Text>
                      <Text style={s.zoneTypeItem}>WhatsApp</Text>
                      <Text style={s.zoneTypeDot}>·</Text>
                      <Text style={s.zoneTypeItem}>Email</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── RESULTS SCREEN ── */}
          {isDone && result && (
            <Animated.View style={[s.results, {
              opacity: resultsAnim,
              transform: [{ translateY: resultsAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
            }]}>

              <View style={s.resultsHeader}>
                <Text style={s.resultsWordmark}>KOVA</Text>
                <TouchableOpacity style={s.statusChip} onPress={handleReset} activeOpacity={0.7}>
                  <View style={s.statusDot} />
                  <Text style={s.statusText}>Image analyzed</Text>
                  <Text style={s.statusAction}>Change</Text>
                </TouchableOpacity>
              </View>

              {/* Image reference card */}
              {imageUri && (
                <View style={s.imageRefCard}>
                  <Image
                    source={{ uri: imageUri }}
                    style={s.imageRefThumb}
                    resizeMode="cover"
                  />
                </View>
              )}

              {/* 0 — Red Flag (above everything else) */}
              {result.redFlag === true && !!result.redFlagTitle && (() => {
                const actions: string[] = Array.isArray(result.redFlagAction)
                  ? result.redFlagAction
                  : typeof result.redFlagAction === 'string' && result.redFlagAction
                    ? [result.redFlagAction]
                    : [];
                return (
                  <Animated.View style={[s.redFlagWrap, {
                    opacity: redFlagAnim,
                    transform: [
                      { scale: redFlagAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                      { scale: redFlagPulse },
                    ],
                  }]}>
                    {/* glow layer */}
                    <View style={s.redFlagGlow} />
                    <View style={s.redFlagCard}>
                      <View style={s.redFlagHeader}>
                        <View style={s.redFlagDot} />
                        <Text style={s.redFlagTitle}>{result.redFlagTitle}</Text>
                      </View>
                      {!!result.redFlagReason && (
                        <Text style={s.redFlagReason}>{result.redFlagReason}</Text>
                      )}
                      {!!result.redFlagConsequence && (
                        <Text style={s.redFlagConsequence}>⚠️ {result.redFlagConsequence}</Text>
                      )}
                      {actions.length > 0 && (
                        <View style={s.redFlagActions}>
                          {actions.map((action, i) => (
                            <View key={i} style={s.redFlagActionRow}>
                              <Text style={s.redFlagActionArrow}>→</Text>
                              <Text style={s.redFlagActionText}>{action}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </Animated.View>
                );
              })()}

              {/* 1 — Summary */}
              {result.summary ? <Text style={s.summaryLine}>{result.summary}</Text> : null}

              {/* 1b — Translation layer (non-English messages only) */}
              {!!result.whatTheySaid && (
                <View style={s.translationCard}>
                  <View style={s.translationRow}>
                    <Text style={s.translationLabel}>What they said</Text>
                    <Text style={s.translationOriginal}>{result.whatTheySaid}</Text>
                  </View>
                  {!!result.whatTheyMean && (
                    <>
                      <View style={s.translationDivider} />
                      <View style={s.translationRow}>
                        <Text style={s.translationLabel}>What it means</Text>
                        <Text style={s.translationMeaning}>{result.whatTheyMean}</Text>
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* 2 — What this really means */}
              <View style={result.redFlag ? s.sectionCompact : s.section}>
                {!result.redFlag && (
                  <Text style={s.sectionLabel}>What's actually going on</Text>
                )}
                <Text style={result.redFlag ? s.leadTextSmall : s.leadText}>{result.whatThisReallyMeans}</Text>
                <Text style={s.impactLine}>{result.impactLine}</Text>
              </View>

              {/* 2 — Risk */}
              <View style={s.section}>
                <Text style={s.sectionLabel}>How serious this is</Text>
                <View style={[s.riskContainer, { borderColor: riskColor + '40', backgroundColor: riskColor + '16' }]}>
                  <Text style={s.riskLabel}>Risk level</Text>
                  <View style={s.riskTop}>
                    <Text style={[s.riskWord, { color: riskColor }]}>{result.riskLevel}</Text>
                    <Animated.View
                      style={[
                        s.riskDot,
                        { backgroundColor: riskColor },
                        { transform: [{ scale: dotScale }], opacity: dotOpacity },
                      ]}
                    />
                  </View>
                  <Text style={s.riskRead}>{result.riskRead}</Text>
                </View>
              </View>

              {/* 3 — What to do */}
              <View style={s.section}>
                <Text style={s.sectionLabel}>What to do next</Text>
                <View style={s.directives}>
                  {result.whatToDo.map((line, i) => (
                    <View key={i} style={s.directiveRow}>
                      <View style={s.directiveDot} />
                      <Text style={s.directiveText}>{line}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* 4 — Say this */}
              <View style={s.sectionDivider} />
              <Animated.View style={[s.section, {
                opacity: sayThisAnim,
                transform: [
                  { translateY: sayThisAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                  { scale: sayThisAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              }]}>
                <View style={s.replyHeader}>
                  <Text style={s.sectionLabel}>Say this</Text>
                  <TouchableOpacity style={s.copyButton} activeOpacity={0.7} onPress={handleCopy}>
                    <Text style={s.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.replyCardWrapper}>
                  <View style={s.replyCard}>
                    <LinearGradient
                      colors={['#191930', '#101020']}
                      style={StyleSheet.absoluteFillObject}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                    />
                    <Text style={s.replyLabel}>Send this</Text>
                    {/* Flash overlay — appears on update confirmation */}
                    <Animated.View style={[StyleSheet.absoluteFillObject, s.refineFlashOverlay, { opacity: refineFlashAnim }]} pointerEvents="none" />
                    <Animated.View style={{ opacity: replyTransitionAnim, transform: [{ scale: replyScaleAnim }] }}>
                      <Text style={s.replyText}>{displayReply?.native}</Text>
                      {isRefining && (
                        <View style={s.refineSpinnerRow}>
                          <Animated.View style={[s.refineDot, { opacity: refineDotAnim }]} />
                          <Text style={s.refineSpinnerText}>Refining…</Text>
                        </View>
                      )}
                      <Animated.View style={{ opacity: toneAnim, transform: [{ translateY: toneAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
                        <Text style={s.replyTone}>Tone: {result.sayThis.tone || 'Direct • Calm • Controlled'}</Text>
                      </Animated.View>
                      <View style={s.replyDivider} />
                      <Text style={s.replyEnglishLabel}>Meaning</Text>
                      <Text style={s.replyEnglish}>{displayReply?.english}</Text>
                    </Animated.View>
                  </View>
                </View>

                {/* Refine section */}
                <Animated.View style={[s.refineSection, { opacity: refineAnim, transform: [{ translateY: refineAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>

                  {!refineOpen && (
                    /* Decision row */
                    <View style={s.refineDecisionRow}>
                      <TouchableOpacity style={s.refineWorksBtn} activeOpacity={0.7} onPress={handleCopy}>
                        <Text style={s.refineWorksBtnText}>{copied ? 'Copied' : 'This works'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.refineChangeBtn}
                        activeOpacity={0.8}
                        onPress={() => {
                          setRefineOpen(true);
                          setTimeout(() => refineInputRef.current?.focus(), 80);
                        }}
                      >
                        <Text style={s.refineChangeBtnText}>Change it</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                </Animated.View>
              </Animated.View>

              {/* 5 — The Long Game */}
              {result.longGame?.length > 0 && (
                <Animated.View style={[s.longGameSection, {
                  opacity: longGameAnim,
                  transform: [{ translateY: longGameAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                }]}>
                  <View style={s.longGameHeader}>
                    <Text style={s.longGameTitle}>The Long Game</Text>
                    <Text style={s.longGameSub}>What to do next, whatever they say</Text>
                  </View>
                  {result.longGame.map((move, i) => (
                    <View key={i} style={s.longGameCard}>
                      <View style={s.longGameCardTop}>
                        <Text style={s.longGameScenario}>{move.scenario}</Text>
                        <Text style={s.longGameAction}>{move.action}</Text>
                      </View>
                      <Text style={s.longGameReply}>{move.reply}</Text>
                    </View>
                  ))}
                </Animated.View>
              )}

              {/* 6 — They replied */}
              <Animated.View style={[s.continueSection, { opacity: longGameAnim }]}>
                <TouchableOpacity
                  style={s.continueBtn}
                  activeOpacity={0.75}
                  onPress={() => {
                    setContinueOpen(true);
                    setRefineOpen(false);
                    setTimeout(() => continueInputRef.current?.focus(), 80);
                  }}
                >
                  <Text style={s.continueBtnText}>They replied — what now?</Text>
                </TouchableOpacity>
              </Animated.View>

            </Animated.View>
          )}

        </ScrollView>

        {/* ── Anchored refine input bar — always visible above keyboard ── */}
        {refineOpen && isDone && (
          <View style={s.refineInputBar}>
            <View style={s.refineInputWrap}>
              <TextInput
                ref={refineInputRef}
                style={s.refineInput}
                placeholder="Make it…"
                placeholderTextColor="#3A3A5A"
                value={refineInstruction}
                onChangeText={setRefineInstruction}
                onSubmitEditing={() => {
                  const t = refineInstruction.trim();
                  if (t) handleRefine(t);
                }}
                returnKeyType="send"
              />
            </View>
            <TouchableOpacity
              style={s.refineCancelRow}
              activeOpacity={0.6}
              onPress={() => { setRefineOpen(false); setRefineInstruction(''); }}
            >
              <Text style={s.refineCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Anchored continue input bar ── */}
        {continueOpen && isDone && (
          <View style={s.refineInputBar}>
            <View style={s.continueInputHeader}>
              <Text style={s.continueInputLabel}>What did they say?</Text>
            </View>
            <View style={s.refineInputWrap}>
              <TextInput
                ref={continueInputRef}
                style={s.refineInput}
                placeholder="Paste their reply…"
                placeholderTextColor="#3A3A5A"
                value={continueMessage}
                onChangeText={setContinueMessage}
                onSubmitEditing={() => {
                  const t = continueMessage.trim();
                  if (t) handleContinue(t);
                }}
                returnKeyType="send"
                editable={!isContinuing}
                multiline
              />
            </View>
            {isContinuing ? (
              <View style={s.refineCancelRow}>
                <Text style={s.refineSpinnerText}>Reading…</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={s.refineCancelRow}
                activeOpacity={0.6}
                onPress={() => { setContinueOpen(false); setContinueMessage(''); }}
              >
                <Text style={s.refineCancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* ── FULL-SCREEN SELECTION / ANALYZING OVERLAY ── */}
      {(isSelecting || isLocked || isAnalyzing) && imageUri && (
        <View style={s.selectionOverlay}>
          <SafeAreaView style={s.selectionInner}>

            {/* Header */}
            <View style={s.selectionHeader}>
              {isSelecting ? (
                <>
                  <Text style={s.selectionHint}>Drag to highlight a message</Text>
                  <TouchableOpacity onPress={handleReset} activeOpacity={0.7}>
                    <Text style={s.selectionCancel}>Cancel</Text>
                  </TouchableOpacity>
                </>
              ) : isLocked ? (
                <>
                  <View />
                  <TouchableOpacity onPress={handleReset} activeOpacity={0.7}>
                    <Text style={s.selectionCancel}>Cancel</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Animated.Text style={[s.selectionHint, { opacity: pulseAnim }]}>
                  Analyzing…
                </Animated.Text>
              )}
            </View>

            {/* Image area — panHandlers active only during selection */}
            <View
              style={s.selectionImageArea}
              onLayout={(e) => {
                setOverlayW(e.nativeEvent.layout.width);
                setOverlayH(e.nativeEvent.layout.height);
              }}
              {...(isSelecting ? panResponder.panHandlers : {})}
            >
              <Image
                source={{ uri: imageUri }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="contain"
                onLoad={(e) => {
                  setImgNatW(e.nativeEvent.source.width);
                  setImgNatH(e.nativeEvent.source.height);
                }}
              />

              {/* Static dim */}
              <View style={s.selectionDim} pointerEvents="none" />

              {/* Touch feedback dim — deepens on drag */}
              <Animated.View style={[s.selectionDim, { opacity: imgTouchAlpha }]} pointerEvents="none" />

              {/* Selection box */}
              {selBoxVisible && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    s.selBox,
                    isLocked && s.selBoxLocked,
                    {
                      left:    selBoxX,
                      top:     selBoxY,
                      width:   selBoxW,
                      height:  selBoxH,
                      opacity: selBoxAlpha,
                    },
                  ]}
                />
              )}

              {/* Shimmer + glow overlay on selection during analysis */}
              {isAnalyzing && selectionBoxRef.current && (
                <View
                  pointerEvents="none"
                  style={[
                    s.analyzeBox,
                    {
                      left:   selectionBoxRef.current.x,
                      top:    selectionBoxRef.current.y,
                      width:  selectionBoxRef.current.width,
                      height: selectionBoxRef.current.height,
                    },
                  ]}
                >
                  {/* Slow glow fill */}
                  <Animated.View style={[s.analyzeBoxGlow, { opacity: selGlowAnim }]} />
                  {/* Shimmer sweep */}
                  <Animated.View
                    style={[
                      s.shimmerSweep,
                      {
                        transform: [{
                          translateX: shimmerAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [
                              -(selectionBoxRef.current.width * 0.5),
                              selectionBoxRef.current.width * 1.1,
                            ],
                          }),
                        }],
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={['transparent', 'rgba(130, 130, 255, 0.11)', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  </Animated.View>
                </View>
              )}

              {/* "Replying to" card — analyzing phase */}
              {isAnalyzing && selectedMessageText && (
                <Animated.View
                  pointerEvents="none"
                  style={[s.replyingToCardWrap, {
                    opacity: cardRevealAnim,
                    transform: [{ translateY: cardRevealAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
                  }]}
                >
                  <View style={s.replyingToCard}>
                    {imageUri && (
                      <Image source={{ uri: imageUri }} style={s.replyingToCardBg} resizeMode="cover" blurRadius={20} />
                    )}
                    <View style={s.replyingToCardOverlay} />
                    <View style={s.replyingToCardContent}>
                      <Text style={s.replyingToLabel}>Replying to</Text>
                      <Text style={s.replyingToText} numberOfLines={3}>{selectedMessageText}</Text>
                    </View>
                  </View>
                </Animated.View>
              )}
            </View>

          </SafeAreaView>

          {/* Lock confirmation panel — sits above SafeAreaView, slides up */}
          {isLocked && (
            <Animated.View style={[
              s.lockPanel,
              {
                opacity: panelAnim,
                transform: [{ translateY: panelAnim.interpolate({ inputRange: [0, 1], outputRange: [200, 0] }) }],
              },
            ]}>

              {/* Header row */}
              <View style={s.lockPanelLabelRow}>
                <Text style={s.lockPanelLabel}>Replying to</Text>
                <View style={s.lockOcrBadge}>
                  {isOcrProcessing ? (
                    <Text style={s.lockOcrStatus}>Reading…</Text>
                  ) : selectedMessageText ? (
                    <Text style={s.lockOcrDone}>Text read</Text>
                  ) : null}
                </View>
              </View>

              {/* Message preview card */}
              <View style={s.msgCard}>
                {selectedMessageText && imageUri && (
                  <Image
                    source={{ uri: imageUri }}
                    style={s.msgCardBg}
                    resizeMode="cover"
                    blurRadius={22}
                  />
                )}
                <View style={s.msgCardOverlay} />
                <View style={s.msgCardInner}>
                  {selectedMessageText ? (
                    <Text style={s.msgCardText} numberOfLines={5}>{selectedMessageText}</Text>
                  ) : cropFailed ? (
                    <Text style={s.msgCardError}>Could not process selection. Try again.</Text>
                  ) : (
                    <Text style={s.msgCardStatus}>{isOcrProcessing ? 'Reading text…' : 'Could not read text'}</Text>
                  )}
                </View>
              </View>

              {/* Stacked buttons */}
              <TouchableOpacity
                style={[s.lockBtnPrimary, (!croppedBase64 || cropFailed) && s.lockBtnPrimaryDisabled]}
                onPress={handleConfirm}
                activeOpacity={0.85}
                disabled={!croppedBase64 || cropFailed}
              >
                <Text style={s.lockBtnPrimaryText}>Continue</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.lockBtnSecondary} onPress={handleAdjustSelection} activeOpacity={0.7}>
                <Text style={s.lockBtnSecondaryText}>Adjust selection</Text>
              </TouchableOpacity>

            </Animated.View>
          )}
        </View>
      )}

    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  topLight: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 300,
    zIndex: 0,
  },
  scroll: {
    flexGrow: 1,
    paddingTop: 16,
    paddingBottom: 120,
  },

  // ── Upload screen ──────────────────────────────────

  topCopy: {
    paddingTop: 36,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  wordmark: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A4A8A',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 22,
  },
  headline: {
    fontSize: 34,
    fontWeight: '800',
    color: '#EEEEFA',
    letterSpacing: -1.2,
    lineHeight: 42,
    marginBottom: 12,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400',
    color: '#46466A',
    lineHeight: 23,
  },

  tensionLine: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3A3A60',
    letterSpacing: 0.3,
    paddingHorizontal: 24,
    marginBottom: 10,
  },

  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#060607',
    zIndex: 100,
  },
  selectionInner: {
    flex: 1,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: '#0D0D16',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(50, 50, 90, 0.4)',
  },
  selectionHint: {
    fontSize: 15,
    fontWeight: '600',
    color: '#C8C8F0',
    letterSpacing: -0.1,
  },
  selectionCancel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#5A5A90',
    letterSpacing: 0.1,
  },
  selectionImageArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  selectionDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 4, 14, 0.45)',
  },

  // ── Selection box ────────────────────────────────────
  selBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(82, 82, 204, 0.75)',
    backgroundColor: 'rgba(82, 82, 204, 0.06)',
    borderRadius: 10,
  },
  selBoxLocked: {
    borderColor: 'rgba(82, 82, 204, 0.98)',
    backgroundColor: 'rgba(82, 82, 204, 0.12)',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 6,
  },

  // ── Analyze overlay (shimmer + glow) ─────────────────
  analyzeBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(100, 100, 220, 0.55)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  analyzeBoxGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(82, 82, 204, 0.07)',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
  },
  shimmerSweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '55%',
  },

  // ── "Replying to" card (analyzing phase) ─────────────
  replyingToCardWrap: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  replyingToCard: {
    backgroundColor: 'rgba(13, 13, 22, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 204, 0.28)',
    borderRadius: 14,
    overflow: 'hidden',
    width: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  replyingToCardBg: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.2,
  },
  replyingToCardOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(6, 6, 18, 0.75)',
  },
  replyingToCardContent: {
    padding: 12,
  },
  replyingToLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#5252CC',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  replyingToText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#DDDDF0',
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  // ── Lock confirmation panel ──────────────────────────
  lockPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(8, 8, 16, 0.98)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(60, 60, 100, 0.25)',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 46,
  },
  lockPanelLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  lockPanelLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4A4A88',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  lockOcrBadge: {
    // no background — just a text indicator
  },
  lockOcrStatus: {
    fontSize: 11,
    fontWeight: '400',
    color: '#3A3A68',
    letterSpacing: 0.1,
  },
  lockOcrDone: {
    fontSize: 11,
    fontWeight: '500',
    color: '#3A7A5A',
    letterSpacing: 0.1,
  },
  msgCard: {
    width: '100%',
    minHeight: 76,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: 'rgba(10, 10, 22, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 204, 0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  msgCardBg: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.22,
  },
  msgCardOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(6, 6, 18, 0.70)',
  },
  msgCardInner: {
    padding: 16,
    minHeight: 76,
    justifyContent: 'center',
  },
  msgCardText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E4E4F6',
    lineHeight: 23,
    letterSpacing: -0.15,
  },
  msgCardStatus: {
    fontSize: 13,
    fontWeight: '400',
    color: '#4A4A7A',
  },
  msgCardError: {
    fontSize: 13,
    fontWeight: '400',
    color: '#E05555',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  lockBtnPrimary: {
    borderRadius: 12,
    backgroundColor: ACCENT,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  lockBtnPrimaryDisabled: {
    opacity: 0.35,
  },
  lockBtnPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  lockBtnSecondary: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  lockBtnSecondaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3C3C72',
    letterSpacing: 0.1,
  },

  uploadWrapper: {
    marginHorizontal: 20,
    marginBottom: 24,
    minHeight: 210,
  },
  glowRingIdle: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 32,
    elevation: 16,
    backgroundColor: 'transparent',
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 14,
    backgroundColor: 'transparent',
  },
  uploadZone: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#32325A',
    overflow: 'hidden',
    padding: 24,
  },
  zoneTopHighlight: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: 1,
    backgroundColor: 'rgba(160,160,255,0.25)',
    zIndex: 2,
  },

  zoneCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  zoneInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 2,
  },

  zonePrimary: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F0F0FC',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 6,
  },
  zoneSecondary: {
    fontSize: 13,
    fontWeight: '400',
    color: '#3C3C62',
    textAlign: 'center',
    letterSpacing: 0.1,
  },

  zoneTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  zoneTypeItem: {
    fontSize: 12,
    fontWeight: '400',
    color: '#44447A',
    letterSpacing: 0.2,
  },
  zoneTypeDot: {
    fontSize: 12,
    color: '#2E2E52',
  },

  zoneAnalyzing: {
    fontSize: 17,
    fontWeight: '500',
    color: '#6060A0',
    letterSpacing: -0.2,
    textAlign: 'center',
  },

  imagePreview: {
    borderRadius: 14,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 8, 18, 0.55)',
  },
  analyzingOverlayText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(180, 180, 240, 0.9)',
    letterSpacing: 0.4,
    textAlign: 'center',
  },

  iconWrap: {
    width: 44,
    height: 44,
    marginBottom: 2,
    position: 'relative',
  },
  iconDoc: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 28,
    height: 36,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#3A3A6A',
    backgroundColor: '#141432',
    paddingHorizontal: 6,
    paddingVertical: 8,
    justifyContent: 'center',
    gap: 5,
  },
  iconDocLine: {
    height: 1.5,
    backgroundColor: '#3A3A6A',
    borderRadius: 1,
  },
  iconDocLineShort: {
    width: '55%',
  },
  iconDocLineMid: {
    width: '75%',
    backgroundColor: '#303060',
  },
  iconLens: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: ACCENT,
    backgroundColor: 'transparent',
    opacity: 0.75,
  },
  iconLensHandle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 2,
    height: 7,
    borderRadius: 1,
    backgroundColor: ACCENT,
    opacity: 0.6,
    transform: [{ rotate: '45deg' }],
  },

  // ── Results screen ──────────────────────────────────

  results: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },

  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginBottom: 4,
  },
  resultsWordmark: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E2E52',
    letterSpacing: 2.8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ACCENT,
    opacity: 0.5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#606090',
  },
  statusAction: {
    fontSize: 11,
    fontWeight: '500',
    color: '#7070A8',
    letterSpacing: 0.2,
    marginLeft: 2,
  },

  summaryLine: {
    fontSize: 22,
    fontWeight: '700',
    color: '#E8E8F8',
    letterSpacing: -0.6,
    lineHeight: 30,
    marginTop: 28,
  },

  // ── Translation card ──────────────────────────────────
  translationCard: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(14, 14, 28, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 204, 0.18)',
    overflow: 'hidden',
  },
  translationRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  translationLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4A4A88',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  translationOriginal: {
    fontSize: 16,
    fontWeight: '500',
    color: '#C8C8F0',
    lineHeight: 23,
    letterSpacing: -0.1,
  },
  translationMeaning: {
    fontSize: 15,
    fontWeight: '400',
    color: '#B0B0D8',
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  translationDivider: {
    height: 1,
    backgroundColor: 'rgba(60, 60, 100, 0.3)',
    marginHorizontal: 16,
  },

  redFlagWrap: {
    marginTop: 22,
    position: 'relative',
  },
  redFlagGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    shadowColor: '#E05555',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 0,
    backgroundColor: 'rgba(224, 85, 85, 0.04)',
  },
  redFlagCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(224, 85, 85, 0.32)',
    backgroundColor: 'rgba(224, 85, 85, 0.09)',
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 12,
  },
  redFlagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  redFlagDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E05555',
    marginRight: 8,
  },
  redFlagTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F07878',
    letterSpacing: -0.2,
    flex: 1,
  },
  redFlagReason: {
    fontSize: 13,
    fontWeight: '400',
    color: '#B87070',
    lineHeight: 19,
  },
  redFlagConsequence: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E07070',
    lineHeight: 19,
    marginTop: 6,
  },
  redFlagActions: {
    marginTop: 9,
    gap: 5,
  },
  redFlagActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  redFlagActionArrow: {
    fontSize: 12,
    color: '#E05555',
    lineHeight: 19,
    fontWeight: '700',
  },
  redFlagActionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#C07878',
    lineHeight: 19,
  },

  section: {
    paddingTop: 56,
  },
  sectionCompact: {
    paddingTop: 20,
  },
  leadTextSmall: {
    fontSize: 15,
    fontWeight: '400',
    color: '#8888B8',
    lineHeight: 22,
    letterSpacing: -0.1,
  },

  // ── Long Game ──────────────────────────────────────
  longGameSection: {
    paddingTop: 48,
    paddingBottom: 8,
  },
  continueSection: {
    paddingTop: 32,
    paddingBottom: 40,
    alignItems: 'center',
  },
  continueBtn: {
    borderWidth: 1,
    borderColor: '#2A2A4A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: '#0E0E1E',
  },
  continueBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#7070CC',
    letterSpacing: 0.3,
  },
  continueInputHeader: {
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  continueInputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5252CC',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  longGameHeader: {
    marginBottom: 18,
  },
  longGameTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#DDDDF8',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  longGameSub: {
    fontSize: 13,
    fontWeight: '400',
    color: '#5A5A88',
    letterSpacing: 0.1,
  },
  longGameCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 204, 0.2)',
    backgroundColor: 'rgba(82, 82, 204, 0.06)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 13,
    marginBottom: 10,
  },
  longGameCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  longGameScenario: {
    fontSize: 12,
    fontWeight: '500',
    color: '#7070B0',
    letterSpacing: 0.1,
    flex: 1,
  },
  longGameAction: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginLeft: 10,
  },
  longGameReply: {
    fontSize: 15,
    fontWeight: '500',
    color: '#C8C8F0',
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  // ───────────────────────────────────────────────────

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C7CD6',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },

  leadText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#EEEEF8',
    lineHeight: 32,
    letterSpacing: -0.4,
  },

  impactLine: {
    fontSize: 15,
    fontWeight: '400',
    color: '#9898C8',
    lineHeight: 23,
    letterSpacing: 0.2,
    marginTop: 12,
    marginBottom: 4,
  },

  riskLabel: {
    fontSize: 10,
    letterSpacing: 1.8,
    color: '#3A3A5A',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  riskContainer: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  riskTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  riskWord: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  riskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  riskRead: {
    fontSize: 13,
    fontWeight: '400',
    color: '#505070',
    lineHeight: 19,
  },

  directives: {
    gap: 10,
  },
  directiveRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  directiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
    marginTop: 10,
    opacity: 0.6,
  },
  directiveText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: '#D0D0F0',
    lineHeight: 26,
    letterSpacing: -0.2,
  },

  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  copyButton: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A48',
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#10101C',
  },
  copyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6868A0',
    letterSpacing: 0.4,
  },
  replyCardWrapper: {
    position: 'relative',
  },
  replyGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 28,
    elevation: 14,
    backgroundColor: 'rgba(82, 82, 204, 0.05)',
  },
  replyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A5E',
    overflow: 'hidden',
    padding: 24,
  },
  replyText: {
    fontSize: 22,
    fontWeight: '400',
    color: '#EAEAF6',
    lineHeight: 34,
    fontStyle: 'italic',
    zIndex: 1,
    marginBottom: 14,
  },
  replyTone: {
    fontSize: 14,
    fontWeight: '500',
    color: '#A0A0FF',
    letterSpacing: 0.3,
    marginTop: 8,
  },
  replyEnglishLabel: {
    fontSize: 10,
    letterSpacing: 1.8,
    color: '#3A3A5A',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  replyEnglish: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6A6A9A',
    lineHeight: 20,
    zIndex: 1,
  },
  confidenceLine: {
    fontSize: 12,
    color: '#4A4A7A',
    marginBottom: 10,
  },
  replyLabel: {
    fontSize: 9,
    letterSpacing: 1.6,
    color: '#2E2E4A',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  replyLabelRefining: {
    color: '#5252CC',
    letterSpacing: 1.2,
  },
  refineLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: 12,
    paddingBottom: 2,
  },
  refineLoadingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ACCENT,
    opacity: 0.7,
  },
  refineLoadingText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5252CC',
    letterSpacing: 0.4,
    opacity: 0.85,
  },
  refineSpinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    marginBottom: 2,
  },
  refineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#7070FF',
  },
  refineSpinnerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7070FF',
    letterSpacing: 0.5,
  },
  refineFlashOverlay: {
    borderRadius: 14,
    backgroundColor: '#4040AA',
    opacity: 0,
  },
  replyDivider: {
    height: 1,
    backgroundColor: '#1E1E38',
    marginVertical: 12,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#141428',
    marginTop: 52,
    marginBottom: 0,
    opacity: 0.6,
  },

  refineSection: {
    marginTop: 18,
  },
  refineChipDisabled: {
    opacity: 0.35,
  },
  // Decision row
  refineDecisionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  refineWorksBtn: {
    flex: 1,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#1E1E3A',
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  refineWorksBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4A4A78',
    letterSpacing: -0.1,
  },
  refineChangeBtn: {
    flex: 1,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(82, 82, 204, 0.35)',
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(82, 82, 204, 0.08)',
  },
  refineChangeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8888DD',
    letterSpacing: -0.1,
  },
  // Suggestion chips
  refineSuggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  refineSuggestChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#22223E',
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: '#0C0C1E',
  },
  refineSuggestText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6868A8',
    letterSpacing: 0.1,
  },
  // Input
  refineInputWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1A1A32',
    backgroundColor: '#080814',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  refineInput: {
    fontSize: 14,
    color: '#C0C0E0',
    padding: 0,
  },
  refineInputBar: {
    borderTopWidth: 1,
    borderTopColor: '#14142A',
    backgroundColor: '#0A0A14',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
  },
  refineCancelRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  refineCancelText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#2E2E52',
    letterSpacing: 0.1,
  },
  // Keep for RefineButton component (chip styles used internally)
  refineChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#28284A',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#0E0E22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refineChipDim: {
    backgroundColor: '#0F0F22',
    borderColor: '#2C2C4E',
  },
  refineChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9090C8',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  refineChipTextDim: {
    color: '#7070A0',
  },

  imageRefCard: {
    marginTop: 20,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E1E38',
    height: 120,
  },
  imageRefThumb: {
    width: '100%',
    height: '100%',
  },

  intentBlock: {
    marginTop: 52,
    marginBottom: 52,
    paddingLeft: 14,
    borderLeftWidth: 1.5,
    borderLeftColor: '#1E1E3C',
  },
  intentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C7CD6',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  intentText: {
    fontSize: 15,
    fontWeight: '400',
    color: '#5A5A8A',
    lineHeight: 22,
  },
});
