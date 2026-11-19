package com.mykitchenmanager.app;

import android.app.Activity;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.Gravity;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://aikitchenmanager.web.app/";
    private static final int RECORD_AUDIO_REQUEST = 101;
    private WebView webView;
    private View errorView;
    private SpeechRecognizer speechRecognizer;
    private Intent speechIntent;
    private PermissionRequest pendingWebAudioRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(248, 250, 252));
        getWindow().setNavigationBarColor(Color.WHITE);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(248, 250, 252));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.addJavascriptInterface(new AndroidVoiceInterface(), "AndroidVoice");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            request.grant(request.getResources());
                        } else {
                            pendingWebAudioRequest = request;
                            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO_REQUEST);
                        }
                        return;
                    }
                }
                request.deny();
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && "aikitchenmanager.web.app".equals(uri.getHost())) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    android.webkit.WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    webView.setVisibility(View.GONE);
                    errorView.setVisibility(View.VISIBLE);
                }
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        errorView = createErrorView();
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);
        webView.loadUrl(APP_URL);
    }

    private void callVoiceCallback(String function, String argument) {
        webView.post(() -> {
            String js = "window." + function + "(" + JSONObject.quote(argument) + ")";
            webView.evaluateJavascript(js, null);
        });
    }

    private void callVoiceCallbackWithoutArgument(String function) {
        webView.post(() -> webView.evaluateJavascript("window." + function + "()", null));
    }

    private void startSpeechRecognition(String language) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            callVoiceCallback("onAndroidVoiceError", "Voice recognition is not available on this device.");
            return;
        }

        if (speechRecognizer != null) speechRecognizer.destroy();
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);

        speechIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        speechIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        speechIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language == null ? "en-IN" : language);
        speechIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        speechIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { callVoiceCallbackWithoutArgument("onAndroidVoiceStart"); }
            @Override public void onBeginningOfSpeech() { callVoiceCallbackWithoutArgument("onAndroidVoiceStart"); }
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() { callVoiceCallbackWithoutArgument("onAndroidVoiceEnd"); }

            @Override
            public void onError(int error) {
                String message;
                switch (error) {
                    case SpeechRecognizer.ERROR_AUDIO: message = "Microphone could not capture audio."; break;
                    case SpeechRecognizer.ERROR_NO_MATCH: message = "No speech detected. Please try again."; break;
                    case SpeechRecognizer.ERROR_NETWORK:
                    case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: message = "Network error during voice recognition."; break;
                    case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: message = "Please allow microphone permission."; break;
                    case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: message = "No speech detected. Please try again."; break;
                    case SpeechRecognizer.ERROR_CLIENT: message = "Voice recognition stopped."; break;
                    default: message = "Could not recognize speech. Please try again.";
                }
                callVoiceCallback("onAndroidVoiceError", message);
            }

            @Override
            public void onResults(Bundle results) {
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) {
                    callVoiceCallback("onAndroidVoiceResult", matches.get(0));
                } else {
                    callVoiceCallback("onAndroidVoiceError", "No speech detected. Please try again.");
                }
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) {
                    callVoiceCallback("onAndroidVoicePartial", matches.get(0));
                }
            }

            @Override public void onEvent(int eventType, Bundle params) {}
        });
        speechRecognizer.startListening(speechIntent);
    }

    private final class AndroidVoiceInterface {
        @JavascriptInterface
        public void startListening(String language) {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO_REQUEST);
                speechIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                speechIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language == null ? "en-IN" : language);
                return;
            }
            runOnUiThread(() -> startSpeechRecognition(language));
        }

        @JavascriptInterface
        public void stopListening() {
            runOnUiThread(() -> {
                if (speechRecognizer != null) speechRecognizer.stopListening();
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == RECORD_AUDIO_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (pendingWebAudioRequest != null) {
                    pendingWebAudioRequest.grant(pendingWebAudioRequest.getResources());
                    pendingWebAudioRequest = null;
                }
                String language = speechIntent != null
                        ? speechIntent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE)
                        : "en-IN";
                runOnUiThread(() -> startSpeechRecognition(language));
            } else {
                if (pendingWebAudioRequest != null) {
                    pendingWebAudioRequest.deny();
                    pendingWebAudioRequest = null;
                }
                callVoiceCallback("onAndroidVoiceError", "Microphone permission is required for voice control.");
            }
        }
    }

    private View createErrorView() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(32, 32, 32, 32);
        layout.setBackgroundColor(Color.rgb(248, 250, 252));

        TextView message = new TextView(this);
        message.setText("Couldn’t connect to MyKitchen Manager. Check your internet connection and try again.");
        message.setTextColor(Color.rgb(65, 71, 78));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        layout.addView(message);

        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(view -> {
            errorView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.loadUrl(APP_URL);
        });
        layout.addView(retry);
        return layout;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (speechRecognizer != null) speechRecognizer.destroy();
        super.onDestroy();
    }
}
