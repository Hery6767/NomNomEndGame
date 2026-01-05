// src/onBoard.tsx

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ImageBackground,
  StatusBar,
  Platform,
  Dimensions,
  Image,
  StyleSheet, // ✅ Tách style ra
} from 'react-native';

import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigations/stack';
import { API_BASE } from '../api/Config';
// Định nghĩa kiểu cho navigation
type OnBoardScreenProp = StackNavigationProp<RootStackParamList, 'OnBoard'>;

// Lấy kích thước màn hình để tính toán độ rộng nút
const { width } = Dimensions.get('window');
const BTN_W = Math.min(width * 0.85, 380); // Giảm nhẹ độ rộng nút cho tinh tế hơn

// Màu chủ đạo
const BRAND = '#0d4d3b';

export default function OnBoard() {
  const navigation = useNavigation<OnBoardScreenProp>();

  return (
    // 1️⃣ ẢNH NỀN TOÀN MÀN HÌNH
    <ImageBackground
      source={require('../image/onBoard.png')} // Đảm bảo đường dẫn ảnh đúng
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* 2️⃣ LỚP PHỦ MÀU GRADIENT */}
      {/* Chỉnh lại gradient để phần dưới tối hơn, làm nổi bật nút bấm */}
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.3)', 'rgba(3, 75, 25, 0.85)']}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={{ flex: 1 }}>

          {/* 3️⃣ LOGO & SLOGAN (Phần trên) */}
          <View style={styles.topContainer}>
            <Image
              source={require('../image/logo.png')} // hoặc ../image/logo_name.png nếu bạn đổi tên
              style={styles.logoImg}
              resizeMode="contain"
            />
            <Text style={styles.sloganText}>Plan. Cook. Enjoy</Text>
          </View>


          {/* 4️⃣ KHỐI NÚT BẤM (Phần dưới) */}
          <View style={styles.bottomContainer}>

            {/* --- NÚT LOGIN --- */}
            <Pressable
              onPress={() => navigation.navigate('LogIn')}
              style={({ pressed }) => [
                styles.loginBtn,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }, // Hiệu ứng khi nhấn
              ]}
            >
              <Text style={styles.loginBtnText}>Login</Text>
            </Pressable>

            {/* --- HOẶC --- */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* --- NÚT TẠO TÀI KHOẢN --- */}
            <Pressable
              onPress={() => navigation.navigate('Register')}
              style={({ pressed }) => [
                styles.registerBtn,
                pressed && { backgroundColor: 'rgba(255,255,255,0.1)' }
              ]}
            >
              <Text style={styles.registerText}>
                New here? <Text style={{ fontWeight: '800', color: '#fff' }}>Create Account</Text>
              </Text>
            </Pressable>

            {/* --- NÚT KHÁCH (GUEST) --- */}
            <Pressable
              onPress={() => console.log('Continue as guest')}
              style={({ pressed }) => [
                styles.guestBtn,
                pressed && { opacity: 0.7 }
              ]}
            >
              <Text style={styles.guestText}>Continue as a Guest</Text>
            </Pressable>

          </View>
        </SafeAreaView>
      </LinearGradient>
    </ImageBackground >
  );
}

// ✅ STYLE SHEET: Tách ra cho code gọn gàng
const styles = StyleSheet.create({
  logoImg: {
    width: 220,
    height: 220,
    marginBottom: 6,
  },
  topContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  logoText: {
    fontFamily: 'OleoScripSwashCaps-Bold', // Nhớ link font này nếu chưa link
    color: '#fff', // Đổi sang trắng cho nổi trên nền tối hoặc xanh đậm tùy ảnh
    fontSize: 56, // To hơn chút cho ấn tượng
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
    elevation: 5,
  },
  sloganText: {
    color: '#e0f2f1', // Màu trắng xanh nhạt
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: 1.5, // Giãn chữ rộng ra cho sang
    textTransform: 'uppercase', // Chữ in hoa
    opacity: 0.9,
  },
  bottomContainer: {
    paddingHorizontal: 24,
    paddingBottom: 60, // Đẩy lên cao hơn chút
    alignItems: 'center',
    width: '100%',
  },
  loginBtn: {
    width: BTN_W,
    backgroundColor: '#003629', // Đổi thành nút trắng chữ xanh cho nổi bật trên nền gradient tối
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  loginBtnText: {
    color: '#fff', // Chữ màu xanh chủ đạo
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    width: BTN_W,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.4)', // Kẻ mờ màu trắng
  },
  dividerText: {
    marginHorizontal: 16,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  registerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 20,
  },
  registerText: {
    textAlign: 'center',
    color: '#e0f2f1',
    fontSize: 16,
  },
  guestBtn: {
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.6)', // Gạch chân mờ
    paddingBottom: 2,
  },
  guestText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    opacity: 0.9,
  },
});