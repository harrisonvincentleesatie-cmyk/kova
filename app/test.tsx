import { View, Text, Button, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";

export default function Home() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
    });

    if (res.canceled || !res.assets?.[0]) return;

    const asset = res.assets[0];

    setImageUri(asset.uri);

    if (!asset.base64) {
      console.log("NO BASE64");
      return;
    }

    console.log("BASE64 LENGTH:", asset.base64.length);

    // CALL BACKEND
    try {
      const response = await fetch("https://kova-backend-p02n.onrender.com/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: asset.base64,
        }),
      });

      const data = await response.json();
      console.log("BACKEND RESPONSE:", data);

      setResult(data);
    } catch (err) {
      console.log("ERROR:", err);
    }
  };

  return (
    <View style={{ padding: 40 }}>
      <Button title="Pick Image" onPress={pickImage} />

      {imageUri && (
        <Image
          source={{ uri: imageUri }}
          style={{ width: 200, height: 200, marginTop: 20 }}
        />
      )}

      {result && (
        <Text style={{ marginTop: 20 }}>
          {JSON.stringify(result, null, 2)}
        </Text>
      )}
    </View>
  );
}
