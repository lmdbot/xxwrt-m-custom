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
 * Scoped, permission-free sensor access. Runs only while overview is visible,
 * the user allows interface animation, and the app is in the foreground.
 */
@CapacitorPlugin(name = "WaterMotion")
public class WaterMotionPlugin extends Plugin implements SensorEventListener {
    private SensorManager sensors;
    private Sensor gravity;
    private Sensor acceleration;
    private boolean wanted = false;
    private boolean registered = false;
    private float gravityX = 0;
    private float accelerationX = 0;
    private long lastEventAt = 0;

    private synchronized boolean registerSensors() {
        if (registered) return true;
        if (sensors == null) {
            sensors = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        }
        if (sensors == null) return false;
        gravity = sensors.getDefaultSensor(Sensor.TYPE_GRAVITY);
        if (gravity == null) gravity = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        acceleration = sensors.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION);
        if (gravity == null) return false;
        registered = sensors.registerListener(this, gravity, SensorManager.SENSOR_DELAY_GAME);
        if (registered && acceleration != null) {
            sensors.registerListener(this, acceleration, SensorManager.SENSOR_DELAY_GAME);
        }
        return registered;
    }

    private synchronized void unregisterSensors() {
        if (sensors != null) sensors.unregisterListener(this);
        registered = false;
        lastEventAt = 0;
        gravityX = 0;
        accelerationX = 0;
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
        if (!registered || event.values.length < 1) return;
        if (event.sensor == gravity) gravityX = event.values[0];
        else if (event.sensor == acceleration) accelerationX = event.values[0];
        else return;
        long now = SystemClock.elapsedRealtimeNanos();
        // At most ~30 events/sec even on 100Hz+ sensors.
        if (now - lastEventAt < 33_000_000L) return;
        lastEventAt = now;
        JSObject sample = new JSObject();
        sample.put("gravityX", gravityX);
        sample.put("accelerationX", accelerationX);
        notifyListeners("sample", sample);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
