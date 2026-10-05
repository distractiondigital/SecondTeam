# Makes a small black-and-white transparency mask from a MakeHuman hair/eyebrow texture:
# white where the texture is opaque, black where it's see-through. Used by build-proxies.mjs.
#   powershell -ExecutionPolicy Bypass -File scripts\figures\alpha-mask.ps1 -In in.png -Out out.png -Size 512
param([string]$In, [string]$Out, [int]$Size = 512)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class AlphaMask {
  public static void Make(string input, string output, int size) {
    using (var src = new Bitmap(input))
    using (var small = new Bitmap(size, size, PixelFormat.Format32bppArgb)) {
      using (var g = Graphics.FromImage(small)) {
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.CompositingMode = CompositingMode.SourceCopy;
        g.DrawImage(src, 0, 0, size, size);
      }
      var rect = new Rectangle(0, 0, size, size);
      var data = small.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      var bytes = new byte[data.Stride * size];
      Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
      for (int i = 0; i < bytes.Length; i += 4) {
        byte a = bytes[i + 3];
        bytes[i] = a; bytes[i + 1] = a; bytes[i + 2] = a; bytes[i + 3] = 255;
      }
      Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
      small.UnlockBits(data);
      small.Save(output, ImageFormat.Png);
    }
  }
}
'@
[AlphaMask]::Make((Resolve-Path $In).Path, $Out, $Size)
