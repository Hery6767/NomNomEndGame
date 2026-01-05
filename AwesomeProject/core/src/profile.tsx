// core/src/profile.tsx

// ==============================
// MÀN PROFILE
// - Header xanh đậm + card kính
// - Avatar tràn lên header (bị “cắt ngang”)
// - Hiển thị tên + email
// - Đếm dữ liệu local từ AsyncStorage: Meal Plans / Liked / Grocery
// ==============================

import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    Pressable,
    Switch,
    ScrollView,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import component header nền xanh + bảng màu + AuthContext
import GreenHeaderBG from '../components/greenHeader';
import { COLORS } from '../style/colors';
import { useAuth } from '../auth/AuthContext';
import { API_BASE } from '../api/Config';
// Base URL API (dùng build link ảnh avatar nếu avatarUrl là path tương đối)

// Lấy các màu hệ thống (theme) dùng trong UI
const { BRAND, BRAND2, BRAND_LIGHT, BORDER, BG } = COLORS;


// ===== TUNING UI (đây là chỗ bạn muốn chỉnh “bg xanh đậm ngắn lại” + “cắt avatar”) =====
// HEADER_H: chiều cao mảng xanh đậm trên cùng
// AVATAR_SIZE: size vòng avatar
// AVATAR_RAISE: avatar “nhô” lên trên card để bị header “cắt ngang”
// CARD_OVERLAP: kéo nguyên khối card lên chồng vào header (âm -> kéo lên)
const HEADER_H = 150;            // ✅ bg xanh đậm ngắn lại: giảm/tăng số này
const AVATAR_SIZE = 120;          // ✅ avatar nhỏ/lớn
const AVATAR_RAISE = 54;         // ✅ avatar nhô lên khỏi card (càng lớn -> tràn lên header nhiều)
const CARD_OVERLAP = -30;        // ✅ card đẩy lên ăn vào header (âm -> kéo lên)

// ==============================
// KEY AsyncStorage
// - Mỗi user có key riêng: ...:${uid}
// - Nếu chưa login -> dùng 'guest'
// ==============================
const keyOf = {
    mealPlans: (uid?: number | null) => `@nomnom_meal_plans:${uid ?? 'guest'}`,
    mealPlansAlt: (uid?: number | null) => `@nomnom_meals:${uid ?? 'guest'}`,
    favoritesIds: (uid?: number | null) => `@nomnom_favorites:${uid ?? 'guest'}`,
    favoritesMeta: (uid?: number | null) => `@nomnom_favorites_meta:${uid ?? 'guest'}`,
    grocery: (uid?: number | null) => `@nomnom_grocery:${uid ?? 'guest'}`,
};

// ==============================
// safeParseJSON
// - Tránh crash khi dữ liệu AsyncStorage bị rỗng / hỏng JSON
// ==============================
function safeParseJSON(raw: string | null) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export default function Profile() {
    // navigation: điều hướng màn hình (InforUser, Recipes, ...)
    const navigation = useNavigation<any>();

    // AuthContext:
    // - signOut: logout
    // - user: thông tin user hiện tại
    // - token: token đăng nhập
    const { signOut, user, token } = useAuth();

    // uid: id user (nếu null -> guest)
    const uid = user?.id ?? null;

    // State: công tắc cài đặt (UI, không liên quan AsyncStorage trong file này)
    const [notifEnabled, setNotifEnabled] = useState(true);
    const [reminderEnabled, setReminderEnabled] = useState(true);

    // State: số đếm hiển thị ở stats
    const [mealCount, setMealCount] = useState(0);
    const [likedCount, setLikedCount] = useState(0);
    const [groceryCount, setGroceryCount] = useState(0);

    // ==============================
    // avatarUriNoCache
    // - Lấy user.avatarUrl
    // - Nếu avatarUrl là relative path -> nối API_BASE
    // - Thêm query ?t=... để “bust cache” (ép Image reload)
    // - useMemo: chỉ tính lại khi avatarUrl đổi
    // ==============================
    const avatarUriNoCache = useMemo(() => {
        const avatarUrl = (user as any)?.avatarUrl || ''; // nếu type chưa có avatarUrl thì cast tạm
        if (!avatarUrl) return '';
        const full =
            avatarUrl.startsWith('http') ? avatarUrl : `${API_BASE}${avatarUrl}`;
        return `${full}?t=${Date.now()}`;
    }, [(user as any)?.avatarUrl]);

    // ==============================
    // loadCounts
    // - Đọc dữ liệu AsyncStorage theo uid
    // - Meal Plans: ưu tiên key mealPlans; nếu 0 thì fallback key cũ mealPlansAlt
    // - Liked: đọc 2 nguồn:
    //   + favoritesIds: mảng id (Array)
    //   + favoritesMeta: object meta (Record)
    //   => lấy Math.max để số đếm “đúng nhất”
    // - Grocery: đọc mảng grocery
    // ==============================
    const loadCounts = useCallback(async () => {
        try {
            const rawPlans = await AsyncStorage.getItem(keyOf.mealPlans(uid));
            const parsedPlans = safeParseJSON(rawPlans);
            let plansLen = Array.isArray(parsedPlans) ? parsedPlans.length : 0;

            if (plansLen === 0) {
                const rawPlans2 = await AsyncStorage.getItem(keyOf.mealPlansAlt(uid));
                const parsedPlans2 = safeParseJSON(rawPlans2);
                plansLen = Array.isArray(parsedPlans2) ? parsedPlans2.length : 0;
            }
            setMealCount(plansLen);

            const rawFavIds = await AsyncStorage.getItem(keyOf.favoritesIds(uid));
            const parsedFavIds = safeParseJSON(rawFavIds);
            const favIdsLen = Array.isArray(parsedFavIds) ? parsedFavIds.length : 0;

            const rawFavMeta = await AsyncStorage.getItem(keyOf.favoritesMeta(uid));
            const parsedFavMeta = safeParseJSON(rawFavMeta);
            const favMetaLen =
                parsedFavMeta && typeof parsedFavMeta === 'object' && !Array.isArray(parsedFavMeta)
                    ? Object.keys(parsedFavMeta).length
                    : 0;

            setLikedCount(Math.max(favIdsLen, favMetaLen));

            const rawGro = await AsyncStorage.getItem(keyOf.grocery(uid));
            const parsedGro = safeParseJSON(rawGro);
            const groLen = Array.isArray(parsedGro) ? parsedGro.length : 0;
            setGroceryCount(groLen);
        } catch {
            // Nếu lỗi parse/đọc storage -> reset về 0
            setMealCount(0);
            setLikedCount(0);
            setGroceryCount(0);
        }
    }, [uid]);

    // ==============================
    // useFocusEffect
    // - Mỗi lần màn Profile được focus (chuyển tab/quay lại) thì đếm lại số liệu
    // ==============================
    useFocusEffect(
        useCallback(() => {
            loadCounts();
        }, [loadCounts]),
    );

    // ==============================
    // goEdit
    // - Chỉ cho vào InforUser khi có token + user.id
    // - Nếu chưa login -> cảnh báo
    // ==============================
    const goEdit = () => {
        if (!token || !user?.id) {
            Alert.alert('Chưa đăng nhập', 'Bạn cần đăng nhập để chỉnh sửa thông tin.');
            return;
        }
        navigation.navigate('InforUser');
    };

    // ==============================
    // handleLogout
    // - Hiện Alert confirm
    // - Nếu Yes -> gọi signOut()
    // ==============================
    const handleLogout = () => {
        setTimeout(() => {
            Alert.alert(
                'Logout',
                'Do you want to log out?',
                [
                    { text: 'No', style: 'cancel' },
                    {
                        text: 'Yes',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                await signOut();
                            } catch (e: any) {
                                Alert.alert('Logout failed', e?.message || 'Unknown error');
                            }
                        },
                    },
                ],
                { cancelable: true },
            );
        }, 100);
    };

    return (
        // SafeAreaView: tránh tai thỏ / cạnh dưới
        <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['left', 'right', 'bottom']}>
            {/* ===== HEADER xanh đậm (ngắn) ===== */}
            {/* GreenHeaderBG: component custom tạo nền header xanh */}
            <GreenHeaderBG backgroundColor={BRAND} height={HEADER_H}>
                <View style={styles.headerRow}>
                    <Text style={styles.headerTitle}>
                        My{' '}
                        <Text style={styles.headerAccent}>
                            Profile
                        </Text>
                    </Text>
                </View>
            </GreenHeaderBG>

            {/* ===== CARD kính + AVATAR (đè lên header) ===== */}
            {/* heroWrap + CARD_OVERLAP: kéo card lên để header cắt avatar */}
            <View style={[styles.heroWrap, { marginTop: CARD_OVERLAP }]}>
                <View style={styles.glassCard}>
                    {/* avatarRing: position absolute + top: -AVATAR_RAISE => avatar nhô lên */}
                    <View style={[styles.avatarRing, { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, top: -AVATAR_RAISE }]}>
                        <Image
                            source={
                                avatarUriNoCache
                                    ? { uri: avatarUriNoCache }
                                    : require('../image/avatar.png')
                            }
                            style={[styles.avatarImg, { width: AVATAR_SIZE - 10, height: AVATAR_SIZE - 10, borderRadius: (AVATAR_SIZE - 10) / 2 }]}
                        />
                    </View>

                    {/* Tên user */}
                    <Text style={styles.profileName} numberOfLines={1}>
                        {user?.fullName || 'Guest'}
                    </Text>

                    {/* Email user */}
                    <Text style={styles.profileEmail} numberOfLines={1}>
                        {user?.email || 'No email'}
                    </Text>
                </View>
            </View>

            {/* ===== BODY (header cố định vì ScrollView nằm dưới) ===== */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Stats */}
                {/* 3 ô đếm dữ liệu */}
                <View style={styles.statsRow}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.statItem,
                            pressed && { backgroundColor: '#f0f0f0', borderColor: BRAND }
                        ]}
                        onPress={() => {
                            // ✅ GỌI ĐÚNG TÊN 'Meals' ĐÃ ĐĂNG KÝ TRONG tab
                            navigation.navigate('Meals');
                        }}
                    >
                        <Text style={styles.statNumber}>{mealCount}</Text>
                        <Text style={styles.statLabel}>Meal Plans</Text>
                    </Pressable>
                    {/* Ô “Liked Recipes” có Pressable:
                       - bấm vào sẽ navigate sang Recipes với filter favorites
                    */}
                    <Pressable
                        style={({ pressed }) => [
                            styles.statItem,
                            pressed && { backgroundColor: '#f0f0f0', borderColor: BRAND } // Hiệu ứng khi bấm
                        ]}
                        onPress={() => {
                            // Chuyển sang màn hình Recipes và gửi kèm tham số filter: 'favorites'
                            navigation.navigate('Recipes', { filter: 'favorites' });
                        }}
                    >
                        <Text style={styles.statNumber}>{likedCount}</Text>
                        <Text style={styles.statLabel}>Liked Recipes</Text>
                    </Pressable>
                    <Pressable
                        style={({ pressed }) => [
                            styles.statItem,
                            pressed && { backgroundColor: '#f0f0f0', borderColor: BRAND }
                        ]}
                        onPress={() => {
                            // ✅ GỌI ĐÚNG TÊN 'Grocery' ĐÃ ĐĂNG KÝ TRONG tab
                            navigation.navigate('Grocery');
                        }}
                    >
                        <Text style={styles.statNumber}>{groceryCount}</Text>
                        <Text style={styles.statLabel}>Grocery Lists</Text>
                    </Pressable>
                </View>

                {/* Account */}
                <Text style={styles.sectionLabel}>Account</Text>
                <View style={styles.card}>
                    <ProfileRow icon="user" label="Personal information" onPress={goEdit} />
                    <ProfileRow icon="coffee" label="Food preferences" />
                    <ProfileRow icon="lock" label="Change password" isLast />
                </View>

                {/* App Settings */}
                <Text style={styles.sectionLabel}>App Settings</Text>
                <View style={styles.card}>
                    {/* Row có Switch: renderRight trả về Switch, nên row được disable press (xem ProfileRow) */}
                    <ProfileRow
                        icon="bell"
                        label="Notifications"
                        renderRight={() => (
                            <Switch
                                value={notifEnabled}
                                onValueChange={setNotifEnabled}
                                thumbColor={notifEnabled ? '#fff' : '#f4f3f4'}
                                trackColor={{ false: 'rgba(0,0,0,0.2)', true: BRAND }}
                            />
                        )}
                    />
                    <ProfileRow
                        icon="clock"
                        label="Meal reminders"
                        isLast
                        renderRight={() => (
                            <Switch
                                value={reminderEnabled}
                                onValueChange={setReminderEnabled}
                                thumbColor={reminderEnabled ? '#fff' : '#f4f3f4'}
                                trackColor={{ false: 'rgba(0,0,0,0.2)', true: BRAND }}
                            />
                        )}
                    />
                </View>

                {/* Support */}
                <Text style={styles.sectionLabel}>Support & About</Text>
                <View style={styles.card}>
                    <ProfileRow icon="help-circle" label="Help & FAQ" />
                    <ProfileRow icon="mail" label="Contact support" />
                    <ProfileRow icon="info" label="About NomNom" isLast />
                </View>

                {/* Logout */}
                <Pressable
                    onPress={handleLogout}
                    style={({ pressed }) => [
                        styles.logoutBtn,
                        pressed && { backgroundColor: '#b3261e', borderColor: '#b3261e' },
                    ]}
                >
                    {({ pressed }) => (
                        <>
                            <Feather name="log-out" size={18} color={pressed ? '#fff' : '#b3261e'} />
                            <Text style={[styles.logoutText, pressed && { color: '#fff' }]}>Log out</Text>
                        </>
                    )}
                </Pressable>
            </ScrollView>
        </SafeAreaView>
    );
}

// ==============================
// RowProps + ProfileRow
// - Component dòng trong card (Account / Settings / Support)
// - Nếu có renderRight (Switch) và không có onPress -> disabled để không highlight khi bấm
// ==============================
type RowProps = {
    icon: string;
    label: string;
    isLast?: boolean;
    renderRight?: () => React.ReactNode;
    onPress?: () => void;
};

function ProfileRow({ icon, label, isLast, renderRight, onPress }: RowProps) {
    const disabled = !!renderRight && !onPress; // row có Switch thì không cần bấm
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                styles.row,
                isLast && { borderBottomWidth: 0 },
                pressed && onPress ? { backgroundColor: 'rgba(0,0,0,0.03)' } : null,
            ]}
        >
            <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                    <Feather name={icon} size={18} color={BRAND2} />
                </View>
                <Text style={styles.rowLabel}>{label}</Text>
            </View>

            {renderRight ? renderRight() : <Feather name="chevron-right" size={18} color="rgba(0,0,0,0.3)" />}
        </Pressable>
    );
}

// ==============================
// STYLES
// - glassCard: nền “bg xanh nhạt” sau avatar + tên (backgroundColor/borderColor)
// - avatarRing: vòng ngoài + shadow
// - statItem: 3 ô số liệu
// ==============================
const styles = StyleSheet.create({
    headerRow: {
        paddingHorizontal: 16,
        paddingTop: 6,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '900',
    },
    headerAccent: {
        fontSize: 24,
        fontWeight: '900',
        color: '#b7f57d',
    },

    // ===== HERO (card kính) =====
    heroWrap: {
        paddingHorizontal: 16,
        // kéo toàn bộ khối card lên sát header (nếu muốn cắt nhiều hơn, tăng CARD_OVERLAP lên gần 0)
        marginTop: -6,
    },

    // ✅ BG xanh nhạt phía sau avatar + tên (đây là chỗ bạn muốn chỉnh “thông số”)
    glassCard: {
        borderRadius: 18,
        alignItems: 'center',

        // độ trong suốt / màu xanh nhạt
        backgroundColor: 'rgba(70, 97, 91, 0)',   // <-- đổi opacity/màu ở đây
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0)',      // <-- viền mờ

        // tạo chỗ cho avatar nhô lên
        paddingTop: AVATAR_RAISE + 10,
        paddingBottom: 14,
        paddingHorizontal: 14,
    },

    avatarRing: {
        position: 'absolute',
        alignSelf: 'center',
        justifyContent: 'center',
        alignItems: 'center',

        backgroundColor: 'rgba(255,255,255,0.92)',
        borderWidth: 4,
        borderColor: 'rgba(155, 238, 78, 0.56)',

        // bóng nhẹ
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
    },

    avatarImg: {
        resizeMode: 'cover',
    },

    profileName: {
        marginTop: 6,
        fontSize: 20,
        fontWeight: '900',
        color: BRAND2,
    },
    profileEmail: {
        marginTop: 4,
        fontSize: 12,
        fontWeight: '700',
        color: BRAND2,
    },

    // ===== BODY =====
    statsRow: { flexDirection: 'row', marginTop: 0, gap: 10 },
    statItem: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: BORDER,
        paddingVertical: 10,
        alignItems: 'center',
    },
    statNumber: { fontSize: 16, fontWeight: '800', color: BRAND2 },
    statLabel: { fontSize: 11, color: BRAND2, opacity: 0.8, fontWeight: '500', },

    sectionLabel: {
        marginTop: 18,
        marginBottom: 6,
        fontSize: 13,
        fontWeight: '700',
        color: BRAND2,
        opacity: 0.85,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        overflow: 'hidden',
    },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
        justifyContent: 'space-between',
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#d6ebc9ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowLabel: { fontSize: 14, color: '#0b1a18', fontWeight: '600' },

    logoutBtn: {
        marginTop: 20,
        marginBottom: 70,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(179,38,30,0.25)',
        backgroundColor: '#fff5f5',
        paddingVertical: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    logoutText: { color: '#b3261e', fontWeight: '700' },
});
