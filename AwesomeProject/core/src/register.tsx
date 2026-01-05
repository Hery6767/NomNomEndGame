// src/register.tsx

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput, // Ô nhập liệu
    Pressable, // Nút bấm
    ImageBackground, // Ảnh nền
    ActivityIndicator, // Vòng quay loading
    Alert, // Thông báo lỗi
    KeyboardAvoidingView, // ✅ MỚI: Tránh bàn phím che mất nút bấm
    Platform, // Kiểm tra hệ điều hành
    ScrollView, // ✅ MỚI: Cho phép cuộn trang nếu màn hình nhỏ
    StyleSheet, // Tách CSS ra cho gọn
} from 'react-native';

import LinearGradient from 'react-native-linear-gradient'; // Hiệu ứng nền
import Feather from 'react-native-vector-icons/Feather'; // ✅ MỚI: Thêm icon đẹp mắt
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext'; // Lấy hàm đăng ký từ Context
import { API_BASE } from '../api/Config';
// Màu xanh chủ đạo
const BRAND = '#0d4d3b';

export default function Register() {
    const navigation = useNavigation<any>();
    const { signUp, loading } = useAuth(); // Lấy hàm signUp và trạng thái loading

    // State lưu dữ liệu form
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');

    // Hàm xử lý khi bấm nút "Create Account"
    const handleRegister = async () => {
        // 1️⃣ Validate cơ bản (Kiểm tra dữ liệu đầu vào)
        if (!fullName.trim() || !email.trim() || !password || !confirm) {
            Alert.alert('Missing info', 'Please fill in all fields'); // Báo lỗi nếu thiếu
            return;
        }

        if (password.length < 6) {
            Alert.alert('Weak password', 'Password must be at least 6 characters');
            return;
        }

        if (password !== confirm) {
            Alert.alert('Mismatch', 'Passwords do not match'); // Báo lỗi nếu mật khẩu không khớp
            return;
        }

        try {
            // 2️⃣ Gọi hàm đăng ký (Gửi lên server)
            await signUp(fullName.trim(), email.trim(), password);

            // ✅ CHÚ Ý: Không cần navigation.reset ở đây nữa
            // AuthContext sẽ tự động cập nhật `user`, và `stack.tsx` sẽ tự chuyển trang Home.

        } catch (err: any) {
            // 3️⃣ Xử lý lỗi từ server (ví dụ: email đã tồn tại)
            console.log('REGISTER ERROR:', err);
            Alert.alert('Register failed', err?.message || 'Cannot create account');
        }
    };

    return (
        // 1️⃣ ẢNH NỀN TOÀN MÀN HÌNH
        <ImageBackground
            source={require('../image/onBoard.png')}
            style={{ flex: 1 }}
            resizeMode="cover"
        >
            {/* 2️⃣ LỚP PHỦ GRADIENT */}
            <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.3)', 'rgba(3,75,25,0.65)']}
                style={{ flex: 1 }}
            >
                {/* 3️⃣ KEYBOARD AVOIDING VIEW (Quan trọng cho trang đăng ký dài) */}
                {/* Giúp đẩy nội dung lên khi bàn phím hiện ra */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    {/* ScrollView để cuộn được trên màn hình nhỏ */}
                    <ScrollView
                        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* --- NÚT BACK (Quay lại) --- */}
                        <Pressable
                            onPress={() => navigation.goBack()}
                            style={styles.backBtn}
                        >
                            <Feather name="arrow-left" size={28} color="#fff" />
                        </Pressable>

                        {/* 4️⃣ CARD TRẮNG CHỨA FORM */}
                        <View style={styles.card}>

                            {/* Header */}
                            <View style={{ marginBottom: 20 }}>
                                <Text style={styles.title}>Create Account</Text>
                                <Text style={styles.subtitle}>Let’s set up your NomNom profile</Text>
                            </View>

                            {/* --- INPUT FULL NAME --- */}
                            <Text style={styles.label}>Full Name</Text>
                            <View style={styles.inputContainer}>
                                <Feather name="user" size={18} color="#888" style={{ marginRight: 10 }} />
                                <TextInput
                                    placeholder="John Doe"
                                    placeholderTextColor="#999"
                                    value={fullName}
                                    onChangeText={setFullName}
                                    style={styles.input}
                                />
                            </View>

                            {/* --- INPUT EMAIL --- */}
                            <Text style={styles.label}>Email</Text>
                            <View style={styles.inputContainer}>
                                <Feather name="mail" size={18} color="#888" style={{ marginRight: 10 }} />
                                <TextInput
                                    placeholder="you@example.com"
                                    placeholderTextColor="#999"
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    style={styles.input}
                                />
                            </View>

                            {/* --- INPUT PASSWORD --- */}
                            <Text style={styles.label}>Password</Text>
                            <View style={styles.inputContainer}>
                                <Feather name="lock" size={18} color="#888" style={{ marginRight: 10 }} />
                                <TextInput
                                    placeholder="••••••••"
                                    placeholderTextColor="#999"
                                    secureTextEntry
                                    value={password}
                                    onChangeText={setPassword}
                                    style={styles.input}
                                />
                            </View>

                            {/* --- INPUT CONFIRM PASSWORD --- */}
                            <Text style={styles.label}>Confirm Password</Text>
                            <View style={styles.inputContainer}>
                                <Feather name="check-circle" size={18} color="#888" style={{ marginRight: 10 }} />
                                <TextInput
                                    placeholder="••••••••"
                                    placeholderTextColor="#999"
                                    secureTextEntry
                                    value={confirm}
                                    onChangeText={setConfirm}
                                    style={styles.input}
                                />
                            </View>

                            {/* --- NÚT ĐĂNG KÝ --- */}
                            <Pressable
                                onPress={handleRegister}
                                disabled={loading}
                                style={({ pressed }) => [
                                    styles.registerBtn,
                                    pressed && { opacity: 0.8 },
                                    loading && { opacity: 0.7 }
                                ]}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.btnText}>Sign Up</Text>
                                )}
                            </Pressable>

                            {/* --- FOOTER: CHUYỂN QUA LOGIN --- */}
                            <View style={styles.footer}>
                                <Text style={{ color: '#666' }}>Already have an account? </Text>
                                <Pressable onPress={() => navigation.navigate('LogIn')}>
                                    <Text style={{ color: BRAND, fontWeight: '700', textDecorationLine: 'underline' }}>
                                        Log in
                                    </Text>
                                </Pressable>
                            </View>

                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </LinearGradient>
        </ImageBackground>
    );
}

// ✅ TÁCH STYLE RIÊNG BIỆT (Dễ đọc, dễ sửa)
const styles = StyleSheet.create({
    backBtn: {
        position: 'absolute',
        top: 40,
        left: 0,
        zIndex: 10,
        padding: 10,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 30, // Bo tròn mạnh
        padding: 24,
        marginTop: 60, // Chừa chỗ cho nút Back

        // Đổ bóng (Shadow)
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5, // Android
    },
    title: {
        fontSize: 26,
        fontWeight: '800', // Chữ đậm
        color: BRAND,
        marginBottom: 4,
    },
    subtitle: {
        color: '#666',
        fontSize: 14,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        marginBottom: 6,
        marginTop: 10,
    },
    inputContainer: {
        flexDirection: 'row', // Icon và Input nằm ngang
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd', // Viền xám nhạt
        borderRadius: 12,
        paddingHorizontal: 12,
        backgroundColor: '#fafafa', // Nền xám rất nhạt
        height: 48, // Chiều cao chuẩn
    },
    input: {
        flex: 1, // Chiếm hết không gian còn lại
        color: '#000',
        height: '100%',
    },
    registerBtn: {
        backgroundColor: BRAND,
        height: 50,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,

        // Đổ bóng nút
        shadowColor: BRAND,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 4,
    },
    btnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 16,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 16,
    },
});