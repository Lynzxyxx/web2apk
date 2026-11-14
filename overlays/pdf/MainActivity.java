package com.web2apk.template;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public class MainActivity extends Activity {

    private PdfRenderer renderer;
    private ParcelFileDescriptor pfd;
    private int pageWidth;

    @SuppressWarnings("deprecation")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int themeColor = Color.parseColor(getString(R.string.theme_color));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().setStatusBarColor(themeColor);
        getWindow().setNavigationBarColor(themeColor);
        View decor = getWindow().getDecorView();
        int ui = decor.getSystemUiVisibility();
        if (getResources().getBoolean(R.bool.fullscreen)) {
            ui |= View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
        }
        double lum = 0.299 * Color.red(themeColor) + 0.587 * Color.green(themeColor) + 0.114 * Color.blue(themeColor);
        if (lum > 186 && Build.VERSION.SDK_INT >= 23) ui |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        decor.setSystemUiVisibility(ui);

        pageWidth = getResources().getDisplayMetrics().widthPixels;
        ListView list = new ListView(this);
        list.setBackgroundColor(0xFF202124);
        list.setDivider(null);
        setContentView(list);

        try {
            File f = new File(getCacheDir(), "doc.pdf");
            try (InputStream in = getAssets().open("www/file.pdf");
                 FileOutputStream out = new FileOutputStream(f)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            pfd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
            renderer = new PdfRenderer(pfd);
            list.setAdapter(new PageAdapter());
        } catch (Exception e) {
            Toast.makeText(this, "Gagal membuka PDF", Toast.LENGTH_LONG).show();
        }
    }

    private class PageAdapter extends BaseAdapter {
        @Override
        public int getCount() {
            return renderer.getPageCount();
        }

        @Override
        public Object getItem(int position) {
            return position;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            ImageView iv = (convertView instanceof ImageView) ? (ImageView) convertView : new ImageView(MainActivity.this);
            iv.setAdjustViewBounds(true);
            iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
            iv.setLayoutParams(new AbsListView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            PdfRenderer.Page page = null;
            try {
                page = renderer.openPage(position);
                int h = (int) ((long) pageWidth * page.getHeight() / page.getWidth());
                Bitmap bm = Bitmap.createBitmap(pageWidth, h, Bitmap.Config.ARGB_8888);
                bm.eraseColor(Color.WHITE);
                page.render(bm, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                iv.setImageBitmap(bm);
            } catch (Exception ignored) {
            } finally {
                if (page != null) page.close();
            }
            return iv;
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        try {
            if (renderer != null) renderer.close();
            if (pfd != null) pfd.close();
        } catch (Exception ignored) { }
    }
}
