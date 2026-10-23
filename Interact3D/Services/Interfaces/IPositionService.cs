using Interact3D.DTOs.Common;
using Interact3D.DTOs.Model;

namespace Interact3D.Services.Interfaces;

public interface IPositionService
{
    Task<ApiResponse<PositionDto>> GetPositionAsync(int userId, int modelId);
    Task<ApiResponse<PositionDto>> SavePositionAsync(int userId, UpdatePositionDto dto);
}