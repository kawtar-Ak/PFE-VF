import React, { useEffect, useRef, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Animated, Easing, Image, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from '@expo/vector-icons';

import LoginScreen from "../Screens/LoginScreen";
import RegisterScreen from "../Screens/RegisterScreen";
import BottomTabNavigator from "../Screens/Home/BottomTabNavigator";
import MatchDetailsScreen from "../Screens/Home/MatchDetailsScreen";
import LeagueCompetitionScreen from "../Screens/Home/LeagueCompetitionScreen";
import ProfileScreen from "../Screens/ProfileScreen";
import { AppThemeProvider, useAppTheme } from './theme/AppThemeContext';

const Stack = createNativeStackNavigator();

function KicklySplash() {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.9)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 700,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(textY, {
        toValue: 0,
        duration: 700,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoOpacity, logoScale, textOpacity, textY]);

  return (
    <View style={styles.splashRoot}>
      <View style={styles.splashTop} />
      <View style={styles.splashBottom} />

      <View style={styles.brandWrap}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
          <Image source={require("../img/result_0.jpeg")} style={styles.splashLogo} resizeMode="cover" />
        </Animated.View>
        <Animated.Text
          style={[
            styles.splashTitle,
            {
              opacity: textOpacity,
              transform: [{ translateY: textY }],
            },
          ]}
        >
          KICKLY
        </Animated.Text>
      </View>
    </View>
  );
}

function AppRoot() {
  const [showSplash, setShowSplash] = useState(true);
  const { navigationTheme, toggleTheme, isDark } = useAppTheme();

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <KicklySplash />;
  }

  return (
    <View style={styles.appRoot}>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          initialRouteName="MainTabs"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
          <Stack.Screen name="LeagueCompetition" component={LeagueCompetitionScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
      </NavigationContainer>

      <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme} activeOpacity={0.88}>
        <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  return (
    <AppThemeProvider>
      <AppRoot />
    </AppThemeProvider>
  );
}

const styles = StyleSheet.create({
  splashRoot: {
    flex: 1,
    backgroundColor: "#061f2f",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  splashTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 250,
    backgroundColor: "#ff0a5b",
    borderBottomRightRadius: 170,
  },
  splashBottom: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: "72%",
    height: 250,
    backgroundColor: "#ff0a5b",
    borderTopLeftRadius: 170,
  },
  brandWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  splashLogo: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: 20,
  },
  splashTitle: {
    color: "#f8fafc",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  appRoot: {
    flex: 1,
  },
  themeToggle: {
    position: 'absolute',
    right: 14,
    top: 46,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF4D4D',
    borderWidth: 1,
    borderColor: '#D93636',
    zIndex: 999,
  },
});
