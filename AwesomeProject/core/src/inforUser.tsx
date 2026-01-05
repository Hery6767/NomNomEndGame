// core/src/inforUser.tsx

// ==============================
// MÀN HÌNH: InforUser (Edit Profile)
// - Hiển thị thông tin user hiện tại (fullName/phone/address/avatar)
// - Cho phép chọn ảnh avatar từ thư viện (image-picker)
// - Gửi PUT lên server để cập nhật:
//   + Nếu có avatar mới: dùng FormData (multipart)
//   + Nếu không có avatar: gửi JSON bình thường
// - Sau khi cập nhật thành công: updateUserLocal() để Profile đổi ngay
// ==============================

import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    Pressable,
    ActivityIndicator,
    Alert,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
// Image picker: mở thư viện ảnh để user chọn avatar
import { launchImageLibrary, ImageLibraryOptions } from 'react-native-image-picker';
import { API_BASE } from '../api/Config';
import { COLORS } from '../style/colors';
import { useAuth } from '../auth/AuthContext';

// Lấy màu từ hệ thống theme của app
const { BRAND, BRAND2, BRAND_LIGHT, BORDER, BG } = COLORS;

// ✅ emulator Android: 10.0.2.2
// API_BASE: host backend (Android emulator dùng 10.0.2.2 để trỏ về máy thật)
// Endpoint cập nhật thông tin user hiện tại
const UPDATE_ENDPOINT = `${API_BASE}/auth/me`;

// Kiểu dữ liệu ảnh chọn từ máy (uri/type/fileName)
type PickedImage = {
    uri: string;
    type?: string;
    fileName?: string;
};

// Kiểu user server có thể trả về sau khi update
type ServerUser = {
    id: number;
    email: string;
    role: string;
    fullName?: string | null;
    phone?: string | null;
    address?: string | null;
    avatarUrl?: string | null; // dạng /uploads/avatars/xxx.jpg hoặc full url
};

export default function InforUser({ navigation }: any) {
    // Lấy từ AuthContext:
    // - user: user hiện tại
    // - token: JWT để gọi API cần auth
    // - updateUserLocal: hàm update user trong context (để Profile/Screen khác đổi ngay)
    const { user, token, updateUserLocal } = useAuth() as any;

    // saving: trạng thái đang lưu (disable nút + show spinner)
    const [saving, setSaving] = useState(false);

    // form fields: state lưu nội dung input
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');

    // avatar
    // avatarUrl: url avatar hiện tại theo server (có thể relative hoặc absolute)
    const [avatarUrl, setAvatarUrl] = useState<string>(''); // từ server (relative or absolute)
    // picked: ảnh mới user chọn (chưa upload)
    const [picked, setPicked] = useState<PickedImage | null>(null); // ảnh mới chọn
    // cacheKey: “bust cache” để Image reload khi url giống nhau
    const [cacheKey, setCacheKey] = useState<number>(Date.now()); // chống cache

    // email: lấy từ user, dùng useMemo để ổn định render
    const email = useMemo(() => user?.email || '', [user?.email]);

    // ==============================
    // fill data từ AuthContext
    // - Khi user có dữ liệu: đổ vào các ô input
    // - Giúp mở màn hình là thấy info hiện tại
    // ==============================
    useEffect(() => {
        if (!user) return;
        setFullName(user?.fullName || '');
        setPhone((user as any)?.phone || '');
        setAddress((user as any)?.address || '');
        setAvatarUrl((user as any)?.avatarUrl || '');
    }, [user]);

    // ✅ build uri avatar theo snippet bạn yêu cầu (có cache-buster)
    // fullAvatarUri: chuẩn hóa avatarUrl thành URL đầy đủ
    const fullAvatarUri = useMemo(() => {
        const raw = avatarUrl || '';
        if (!raw) return '';
        return raw.startsWith('http') ? raw : `${API_BASE}${raw}`;
    }, [avatarUrl]);

    // uriNoCache: thêm query ?t=cacheKey để tránh ảnh bị cache (đổi ảnh mà vẫn hiện ảnh cũ)
    const uriNoCache = useMemo(() => {
        return fullAvatarUri ? `${fullAvatarUri}?t=${cacheKey}` : '';
    }, [fullAvatarUri, cacheKey]);

    // avatarSource: ưu tiên ảnh vừa chọn (picked) để preview ngay,
    // nếu chưa chọn thì dùng avatar từ server (uriNoCache),
    // nếu không có nữa thì dùng ảnh local mặc định
    const avatarSource =
        picked?.uri ? { uri: picked.uri } :
            uriNoCache ? { uri: uriNoCache } :
                require('../image/avatar.png');

    // ==============================
    // pickAvatar
    // - Mở thư viện ảnh
    // - Lấy asset đầu tiên
    // - Lưu vào state picked để preview + dùng khi submit FormData
    // - setCacheKey để ép refresh preview nếu cần
    // ==============================
    const pickAvatar = async () => {
        const options: ImageLibraryOptions = {
            mediaType: 'photo',
            selectionLimit: 1,
            includeBase64: false,
            // ✅ nén nhẹ bằng resize (ổn định hơn quality vì TS hay lệch version)
            maxWidth: 1200,
            maxHeight: 1200,
        };

        const res = await launchImageLibrary(options);

        if (res.didCancel) return;

        const asset = res.assets?.[0];
        if (!asset?.uri) {
            Alert.alert('Lỗi', 'Không lấy được ảnh. Thử lại.');
            return;
        }

        setPicked({
            uri: asset.uri,
            type: asset.type || 'image/jpeg',
            fileName: asset.fileName || `avatar_${Date.now()}.jpg`,
        });

        // đổi cacheKey để preview chắc chắn refresh nếu đang dùng URL cũ
        setCacheKey(Date.now());
    };

    // ==============================
    // validate
    // - Kiểm tra dữ liệu trước khi save
    // - fullName bắt buộc
    // - phone: nếu có nhập thì kiểm tra độ dài tối thiểu (số)
    // ==============================
    const validate = () => {
        const name = fullName.trim();
        if (!name) return 'Vui lòng nhập họ tên.';
        if (phone) {
            const digits = phone.replace(/\D/g, '');
            if (digits.length > 0 && digits.length < 9) return 'Số điện thoại có vẻ chưa đúng.';
        }
        return null;
    };

    // ==============================
    // onSave
    // - Nếu chưa login -> báo và return
    // - Validate input
    // - Nếu có avatar mới -> FormData (multipart)
    // - Nếu không có avatar -> JSON (application/json)
    // - Parse response JSON
    // - Update context local (updateUserLocal) để Profile cập nhật ngay
    // - Nếu server trả avatarUrl mới -> cập nhật avatarUrl + reset picked + refresh cacheKey
    // - Sau đó goBack
    // ==============================
    const onSave = async () => {
        if (!user || !token) {
            Alert.alert('Chưa đăng nhập', 'Vui lòng đăng nhập lại.');
            return;
        }

        const msg = validate();
        if (msg) {
            Alert.alert('Thiếu thông tin', msg);
            return;
        }

        try {
            setSaving(true);

            const hasNewAvatar = !!picked?.uri;

            let res: Response;

            // Nếu có avatar mới: dùng FormData để upload file
            if (hasNewAvatar) {
                const form = new FormData();
                form.append('fullName', fullName.trim());
                form.append('phone', phone.trim());
                form.append('address', address.trim());

                // append file field tên 'avatar' (backend phải nhận đúng key này)
                form.append('avatar', {
                    uri: picked!.uri,
                    type: picked!.type || 'image/jpeg',
                    name: picked!.fileName || 'avatar.jpg',
                } as any);

                res = await fetch(UPDATE_ENDPOINT, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        // ❌ không set Content-Type khi dùng FormData
                        // (fetch sẽ tự set multipart boundary đúng)
                    },
                    body: form,
                });
            } else {
                // Không upload ảnh: gửi JSON thông thường
                res = await fetch(UPDATE_ENDPOINT, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        fullName: fullName.trim(),
                        phone: phone.trim(),
                        address: address.trim(),
                    }),
                });
            }

            // parse json (có try/catch để tránh crash nếu server không trả JSON)
            let json: any = null;
            try {
                json = await res.json();
            } catch {
                json = null;
            }

            // Nếu HTTP lỗi -> lấy message từ json (error/message) hoặc fallback HTTP status
            if (!res.ok) {
                const msgErr = json?.error || json?.message || `HTTP ${res.status}`;
                throw new Error(msgErr);
            }

            // backend nên trả: { user: {...} }
            const u: ServerUser | undefined = json?.user;

            // nếu backend trả luôn object user (không bọc user) thì dùng fallback
            const nextUser: any = u || json;

            // cập nhật local context để Profile đổi ngay
            if (typeof updateUserLocal === 'function' && nextUser) {
                await updateUserLocal(nextUser);
            }

            // cập nhật avatarUrl theo server trả về (nếu có)
            if (nextUser?.avatarUrl) {
                setAvatarUrl(nextUser.avatarUrl);
                setPicked(null);
                setCacheKey(Date.now());
            }

            Alert.alert('Thành công', 'Đã cập nhật thông tin.');
            navigation.goBack();
        } catch (e: any) {
            Alert.alert('Lỗi', e?.message || 'Cập nhật thất bại');
        } finally {
            setSaving(false);
        }
    };

    // ==============================
    // Guard: nếu không có user -> hiển thị trạng thái “chưa đăng nhập”
    // ==============================
    if (!user) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
                <View style={styles.headerRow}>
                    <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
                        <Feather name="chevron-left" size={22} color={BRAND2} />
                    </Pressable>
                    <Text style={styles.headerTitle}>Edit Profile</Text>
                    <View style={{ width: 36 }} />
                </View>
                <View style={styles.center}>
                    <Text style={{ color: BRAND2, opacity: 0.85 }}>Bạn chưa đăng nhập.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
            {/* Header */}
            <View style={styles.headerRow}>
                <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
                    <Feather name="chevron-left" size={22} color={BRAND2} />
                </Pressable>
                <Text style={styles.headerTitle}>Edit Profile</Text>
                <View style={{ width: 36 }} />
            </View>

            {/* KeyboardAvoidingView: tránh bàn phím che nội dung trên iOS */}
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                    {/* Avatar hero */}
                    <View style={styles.heroCard}>
                        <View style={styles.avatarBlock}>
                            <View style={styles.avatarRing}>
                                {/* avatarSource đã ưu tiên picked -> uriNoCache -> avatar local */}
                                <Image source={avatarSource} style={styles.avatar} />
                            </View>

                            {/* Nút mở thư viện ảnh để đổi avatar */}
                            <Pressable onPress={pickAvatar} style={({ pressed }) => [styles.cameraBtn, pressed && styles.pressed]}>
                                <Feather name="camera" size={16} color="#fff" />
                                <Text style={styles.cameraText}>Change</Text>
                            </Pressable>
                        </View>

                        <View style={{ flex: 1 }}>
                            {/* Preview tên lớn (lấy từ state fullName đang edit) */}
                            <Text style={styles.nameBig}>{fullName || 'Your name'}</Text>
                            {/* Email luôn là read-only (lấy từ user) */}
                            <Text style={styles.emailSmall}>{email}</Text>

                            {/* Các pill mô tả trạng thái */}
                            <View style={styles.pillRow}>
                                <View style={styles.pill}>
                                    <Feather name="shield" size={14} color={BRAND2} />
                                    <Text style={styles.pillText}>Account</Text>
                                </View>
                                <View style={styles.pill}>
                                    <Feather name="edit-3" size={14} color={BRAND2} />
                                    <Text style={styles.pillText}>Editable</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Form */}
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Personal information</Text>

                        {/* Field: component input có icon */}
                        <Field
                            icon="user"
                            label="Full name"
                            value={fullName}
                            onChangeText={setFullName}
                            placeholder="Enter your full name"
                        />

                        <Field
                            icon="phone"
                            label="Phone"
                            value={phone}
                            onChangeText={setPhone}
                            placeholder="Enter phone number"
                            keyboardType="phone-pad"
                        />

                        <Field
                            icon="map-pin"
                            label="Address"
                            value={address}
                            onChangeText={setAddress}
                            placeholder="Enter your address"
                            multiline
                            height={92}
                        />

                        <View style={styles.divider} />

                        {/* Save button:
                           - saving=true: show ActivityIndicator
                           - saving=false: show icon + text
                        */}
                        <Pressable
                            onPress={onSave}
                            disabled={saving}
                            style={({ pressed }) => [
                                styles.saveBtn,
                                pressed && styles.pressed,
                                saving && { opacity: 0.7 },
                            ]}
                        >
                            {saving ? (
                                <ActivityIndicator />
                            ) : (
                                <>
                                    <Feather name="save" size={16} color="#fff" />
                                    <Text style={styles.saveText}>Save changes</Text>
                                </>
                            )}
                        </Pressable>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ==============================
// Component Field
// - Render label + input có icon
// - Hỗ trợ multiline (Address) với height tùy chỉnh
// ==============================
function Field(props: {
    icon: string;
    label: string;
    value: string;
    onChangeText: (t: string) => void;
    placeholder?: string;
    keyboardType?: any;
    multiline?: boolean;
    height?: number;
}) {
    return (
        <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>{props.label}</Text>

            <View style={styles.inputWrap}>
                <View style={styles.iconWrap}>
                    <Feather name={props.icon as any} size={16} color={BRAND2} />
                </View>

                <TextInput
                    value={props.value}
                    onChangeText={props.onChangeText}
                    placeholder={props.placeholder}
                    placeholderTextColor="rgba(0,0,0,0.35)"
                    keyboardType={props.keyboardType}
                    multiline={props.multiline}
                    style={[
                        styles.input,
                        props.multiline && { height: props.height || 92, paddingTop: 12, textAlignVertical: 'top' },
                    ]}
                />
            </View>
        </View>
    );
}

// ==============================
// Styles
// - heroCard: thẻ top chứa avatar + name/email
// - avatarRing/avatar: kích thước + viền
// - inputWrap/iconWrap/input: layout input có icon
// - saveBtn: nút lưu
// ==============================
const styles = StyleSheet.create({
    headerRow: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#0b1a18' },
    headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    heroCard: {
        marginTop: 6,
        backgroundColor: '#f4f8f5',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 14,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
    },
    avatarBlock: { width: 104, alignItems: 'center' },
    avatarRing: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatar: { width: 74, height: 74, borderRadius: 37 },

    cameraBtn: {
        marginTop: 10,
        backgroundColor: BRAND,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    cameraText: { color: '#fff', fontWeight: '800', fontSize: 12 },

    nameBig: { fontSize: 18, fontWeight: '900', color: '#0b1a18' },
    emailSmall: { fontSize: 12, color: BRAND2, opacity: 0.8, marginTop: 2 },

    pillRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    pill: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: BORDER,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
    },
    pillText: { fontSize: 12, fontWeight: '700', color: BRAND2, opacity: 0.9 },

    card: {
        marginTop: 12,
        backgroundColor: '#fff',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 14,
    },
    sectionTitle: { fontSize: 14, fontWeight: '900', color: '#0b1a18' },

    label: { fontSize: 12, fontWeight: '800', color: BRAND2, opacity: 0.9, marginBottom: 6 },

    inputWrap: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: '#d6ebc9ff',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: BORDER,
    },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fff',
        color: '#0b1a18',
    },

    divider: { height: 1, backgroundColor: BORDER, marginTop: 16, marginBottom: 12 },

    saveBtn: {
        backgroundColor: BRAND,
        borderRadius: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveText: { color: '#fff', fontWeight: '900' },
    pressed: { opacity: 0.86 },

    note: { marginTop: 10, fontSize: 12, color: 'rgba(0,0,0,0.55)' },
});
