using Microsoft.EntityFrameworkCore;
using Interact3D.Data;
using Interact3D.DTOs.Common;
using Interact3D.DTOs.Model;
using Interact3D.Helpers;
using Interact3D.Models;
using Interact3D.Services.Interfaces;

namespace Interact3D.Services;

public class ModelService : IModelService
{
    private readonly AppDbContext _context;

    public ModelService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<ApiResponse<List<ModelDto>>> GetAvailableModelsAsync(int userId)
    {
        var models = await _context.tbl_Model3D
            .Where(m => !m.IsDeleted && (m.IsSystem || m.IsPublic || m.UserId == userId))
            .OrderByDescending(m => m.IsSystem)
            .ThenByDescending(m => m.CreatedAt)
            .Select(m => new ModelDto
            {
                Id = m.Id,
                Name = m.Name,
                Description = m.Description,
                FilePath = m.FilePath,
                ThumbnailUrl = m.ThumbnailUrl,
                BoneStandard = m.BoneStandard,
                HasAnimation = m.HasAnimation,
                IsSystem = m.IsSystem,
                IsOwnedByUser = m.UserId == userId
            })
            .ToListAsync();

        return ApiResponse<List<ModelDto>>.Ok(models);
    }

    public async Task<ApiResponse<ModelDto>> GetModelByIdAsync(int modelId, int userId)
    {
        var model = await _context.tbl_Model3D
            .Where(m => m.Id == modelId && !m.IsDeleted && (m.IsSystem || m.IsPublic || m.UserId == userId))
            .Select(m => new ModelDto
            {
                Id = m.Id,
                Name = m.Name,
                Description = m.Description,
                FilePath = m.FilePath,
                ThumbnailUrl = m.ThumbnailUrl,
                BoneStandard = m.BoneStandard,
                HasAnimation = m.HasAnimation,
                IsSystem = m.IsSystem,
                IsOwnedByUser = m.UserId == userId
            })
            .FirstOrDefaultAsync();

        if (model == null)
            return ApiResponse<ModelDto>.Fail("Không tìm thấy model hoặc bạn không có quyền truy cập.");

        return ApiResponse<ModelDto>.Ok(model);
    }

    public async Task<ApiResponse<ModelDto>> UploadModelAsync(int userId, UploadModelDto dto, string webRootPath)
    {
        var modelVal = FileHelper.ValidateModelFile(dto.File);
        if (!modelVal.IsValid)
            return ApiResponse<ModelDto>.Fail(modelVal.Error);

        var thumbVal = FileHelper.ValidateThumbnail(dto.Thumbnail);
        if (!thumbVal.IsValid)
            return ApiResponse<ModelDto>.Fail(thumbVal.Error);

        // Lưu file 3D
        var filePath = await FileHelper.SaveFileAsync(dto.File, webRootPath, "uploads/models");

        // Lưu ảnh thumbnail nếu có
        string? thumbPath = null;
        if (dto.Thumbnail != null)
        {
            thumbPath = await FileHelper.SaveFileAsync(dto.Thumbnail, webRootPath, "uploads/thumbnails");
        }

        var fileSizeMb = Math.Round((decimal)dto.File.Length / (1024 * 1024), 2);

        var model = new tbl_Model3D
        {
            UserId = userId,
            Name = dto.Name.Trim(),
            Description = dto.Description?.Trim(),
            FilePath = filePath,
            FileSizeMB = fileSizeMb,
            ThumbnailUrl = thumbPath,
            BoneStandard = dto.BoneStandard ?? "None",
            HasAnimation = dto.HasAnimation,
            IsSystem = false,
            IsPublic = dto.IsPublic,
            IsDeleted = false,
            CreatedAt = DateTime.Now,
            UpdatedAt = DateTime.Now
        };

        _context.tbl_Model3D.Add(model);
        await _context.SaveChangesAsync();

        return ApiResponse<ModelDto>.Ok(new ModelDto
        {
            Id = model.Id,
            Name = model.Name,
            Description = model.Description,
            FilePath = model.FilePath,
            ThumbnailUrl = model.ThumbnailUrl,
            BoneStandard = model.BoneStandard,
            HasAnimation = model.HasAnimation,
            IsSystem = model.IsSystem,
            IsOwnedByUser = true
        }, "Upload model thành công!");
    }

    public async Task<ApiResponse<bool>> DeleteModelAsync(int modelId, int userId, bool isAdmin, string webRootPath)
    {
        var model = await _context.tbl_Model3D.FindAsync(modelId);
        if (model == null || model.IsDeleted)
            return ApiResponse<bool>.Fail("Model không tồn tại.");

        if (model.IsSystem)
            return ApiResponse<bool>.Fail("Không thể xóa model mặc định của hệ thống.");

        if (!isAdmin && model.UserId != userId)
            return ApiResponse<bool>.Fail("Bạn không có quyền xóa model này.");

        // Soft delete trong database
        model.IsDeleted = true;
        model.UpdatedAt = DateTime.Now;
        await _context.SaveChangesAsync();

        // Xóa file vật lý tương ứng
        FileHelper.DeleteFile(webRootPath, model.FilePath);
        if (!string.IsNullOrEmpty(model.ThumbnailUrl))
            FileHelper.DeleteFile(webRootPath, model.ThumbnailUrl);

        return ApiResponse<bool>.Ok(true, "Đã xóa model thành công.");
    }
}