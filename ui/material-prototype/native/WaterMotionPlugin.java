package __PACKAGE__;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Permission-free accelerometer + gravity sampling. Android sources expose
 * linear acceleration when possible, otherwise an accelerometer high-pass
 * estimate (rather than losing shake entirely on some device families).
 */
@CapacitorPlugin(name = "WaterMotion")
public class WaterMotionPlugin extends Plugin implements SensorEventListener {
    private SensorManager sensors;
    private Sensor gravity;
    private Sensor acceleration;
    private boolean wanted = false;
    private boolean registered = false;
    private boolean gravityInitialized = false;
    private float gravityX = 0;
    private float gravityY = 0;
    private float accelerationX = 0;
    private float accelerationY = 0;
    private long lastEventAt = 0;

    private synchronized boolean registerSensors() {
        if (registered) return true;
        if (sensors == null) {
            sensors = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        }
        if (sensors == null) return false;
        Sensor accelerometer = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        gravity = sensors.getDefaultSensor(Sensor.TYPE_GRAVITY);
        if (gravity == null) gravity = accelerometer;
        acceleration = sensors.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
        if (acceleration == null) acceleration = accelerometer;
        if (gravity == null) return false;
        registered = sensors.registerListener(this, gravity, SensorManager.SENSOR_DELAY_GAME);
        if (registered && acceleration != null && acceleration != gravity) {
            sensors.registerListener(this, acceleration, SensorManager.SENSOR_DELAY_GAME);
        }
        return registered;
    }

    private synchronized void unregisterSensors() {
        if (sensors != null) sensors.unregisterListener(this);
        registered = false;
        gravityInitialized = false;
        lastEventAt = 0;
        gravityX = 0;
        gravityY = 0;
        accelerationX = 0;
        accelerationY = 0;
    }

    @PluginMethod
    public void start(PluginCall call) {
        wanted = true;
        boolean available = registerSensors();
        JSObject result = new JSObject();
        result.put("available", available);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        wanted = false;
        unregisterSensors();
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        unregisterSensors();
    }

    @Override
    protected void handleOnResume() {
        if (wanted) registerSensors();
    }

    @Override
    protected void handleOnDestroy() {
        wanted = false;
        unregisterSensors();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!registered || event.values.length < 2) return;
        if (event.sensor == gravity) {
            if (gravity.getType() == Sensor.TYPE_ACCELEROMETER) {
                // First reading calibrates immediately to avoid a large false shake.
                if (!gravityInitialized) {
                    gravityX = event.values[0];
                    gravityY = event.values[1];
                    gravityInitialized = true;
                } else {
                    gravityX = gravityX * .89f + event.values[0] * .11f;
                    gravityY = gravityY * .89f + event.values[1] * .11f;
                }
            } else {
                gravityX = event.values[0];
                gravityY = event.values[1];
                gravityInitialized = true;
            }
            if (gravity == acceleration) {
                accelerationX = event.values[0] - gravityX;
                accelerationY = event.values[1] - gravityY;
            }
        } else if (event.sensor == acceleration) {
            if (acceleration.getType() == Sensor.TYPE_ACCELEROMETER) {
                accelerationX = event.values[0] - gravityX;
                accelerationY = event.values[1] - gravityY;
            } else {
                accelerationX = event.values[0];
                accelerationY = event.values[1];
            }
        } else return;

        long now = SystemClock.elapsedRealtimeNanos();
        // Avoid flooding the bridge even on 100-400Hz sensor hardware.
        if (now - lastEventAt < 33_000_000L) return;
        lastEventAt = now;
        JSObject sample = new JSObject();
        sample.put("gravityX", gravityX);
        sample.put("accelerationX", accelerationX);
        sample.put("accelerationY", accelerationY);
        notifyListeners("sample", sample);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
