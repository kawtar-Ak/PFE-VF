import React, { useEffect, useRef, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

import LoginScreen from "../Screens/LoginScreen";
import RegisterScreen from "../Screens/RegisterScreen";
import BottomTabNavigator from "../Screens/Home/BottomTabNavigator";
import MatchDetailsScreen from "../Screens/Home/MatchDetailsScreen";
import ProfileScreen from "../Screens/ProfileScreen";

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

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <KicklySplash />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Home" component={BottomTabNavigator} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
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
});
