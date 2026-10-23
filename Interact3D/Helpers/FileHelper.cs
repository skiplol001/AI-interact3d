namespace Interact3D.Helpers;

public static class FileHelper
{
    private static readonly string[] AllowedModelExtensions = { ".glb", ".gltf", ".fbx" };
    private static readonly string[] AllowedImageExtensions = { ".jpg", ".jpeg", ".png", ".webp" };
    private const long MaxModelSizeBytes = 50 * 1024 * 1024; // 50MB
    private const long MaxImageSizeBytes = 5 * 1024 * 1024;  // 5MB

    public static (bool IsValid, string Error) ValidateModelFile(IFormFile? file)
    {
        if (file == null || file.Length == 0)
            return (false, "File model 3D không được để trống.");

        if (file.Length > MaxModelSizeBytes)
            return (false, "Dung lượng file 3D vượt quá giới hạn 50MB.");

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedModelExtensions.Contains(ext))
            return (false, $"Định dạng file không hỗ trợ ({ext}). Chỉ chấp nhận .glb, .gltf, .fbx");

        return (true, string.Empty);
    }

    public static (bool IsValid, string Error) ValidateThumbnail(IFormFile? file)
    {
        if (file == null || file.Length == 0)
            return (true, string.Empty); // Thumbnail là tùy chọn

        if (file.Length > MaxImageSizeBytes)
            return (false, "Dung lượng ảnh thumbnail vượt quá giới hạn 5MB.");

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedImageExtensions.Contains(ext))
            return (false, "Chỉ chấp nhận file ảnh định dạng .jpg, .png, .webp");

        return (true, string.Empty);
    }

    public static async Task<string> SaveFileAsync(IFormFile file, string webRootPath, string subFolder)
    {
        var targetFolder = Path.Combine(webRootPath, subFolder.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
        if (!Directory.Exists(targetFolder))
            Directory.CreateDirectory(targetFolder);

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var uniqueFileName = $"{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(targetFolder, uniqueFileName);

        using (var stream = new FileStream(fullPath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        return $"/{subFolder.Trim('/')}/{uniqueFileName}";
    }

    public static void DeleteFile(string webRootPath, string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return;

        var fullPath = Path.Combine(webRootPath, relativePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
        if (File.Exists(fullPath))
        {
            try { File.Delete(fullPath); } catch { /* Bỏ qua nếu đang bị giữ khóa */ }
        }
    }
}