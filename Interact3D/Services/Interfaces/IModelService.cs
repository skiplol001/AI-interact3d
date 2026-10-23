using Interact3D.DTOs.Common;
using Interact3D.DTOs.Model;

namespace Interact3D.Services.Interfaces;

public interface IModelService
{
    Task<ApiResponse<List<ModelDto>>> GetAvailableModelsAsync(int userId);
    Task<ApiResponse<ModelDto>> GetModelByIdAsync(int modelId, int userId);
    Task<ApiResponse<ModelDto>> UploadModelAsync(int userId, UploadModelDto dto, string webRootPath);
    Task<ApiResponse<bool>> DeleteModelAsync(int modelId, int userId, bool isAdmin, string webRootPath);
}