using Microsoft.EntityFrameworkCore;
using Interact3D.Data;
using Interact3D.DTOs.Common;
using Interact3D.DTOs.Model;
using Interact3D.Models;
using Interact3D.Services.Interfaces;

namespace Interact3D.Services;

public class PositionService : IPositionService
{
    private readonly AppDbContext _context;

    public PositionService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<ApiResponse<PositionDto>> GetPositionAsync(int userId, int modelId)
    {
        var pos = await _context.tbl_ModelPosition
            .FirstOrDefaultAsync(p => p.UserId == userId && p.ModelId == modelId);

        if (pos == null)
        {
            return ApiResponse<PositionDto>.Ok(new PositionDto
            {
                ModelId = modelId,
                PositionX = 0,
                PositionY = 0,
                PositionZ = 0,
                RotationY = 0,
                UpdatedAt = DateTime.Now
            });
        }

        return ApiResponse<PositionDto>.Ok(new PositionDto
        {
            ModelId = pos.ModelId,
            PositionX = pos.PositionX,
            PositionY = pos.PositionY,
            PositionZ = pos.PositionZ,
            RotationY = pos.RotationY,
            UpdatedAt = pos.UpdatedAt
        });
    }

    public async Task<ApiResponse<PositionDto>> SavePositionAsync(int userId, UpdatePositionDto dto)
    {
        var pos = await _context.tbl_ModelPosition
            .FirstOrDefaultAsync(p => p.UserId == userId && p.ModelId == dto.ModelId);

        if (pos == null)
        {
            pos = new tbl_ModelPosition
            {
                UserId = userId,
                ModelId = dto.ModelId,
                PositionX = dto.PositionX,
                PositionY = dto.PositionY,
                PositionZ = dto.PositionZ,
                RotationY = dto.RotationY,
                UpdatedAt = DateTime.Now
            };
            _context.tbl_ModelPosition.Add(pos);
        }
        else
        {
            pos.PositionX = dto.PositionX;
            pos.PositionY = dto.PositionY;
            pos.PositionZ = dto.PositionZ;
            pos.RotationY = dto.RotationY;
            pos.UpdatedAt = DateTime.Now;
        }

        await _context.SaveChangesAsync();

        return ApiResponse<PositionDto>.Ok(new PositionDto
        {
            ModelId = pos.ModelId,
            PositionX = pos.PositionX,
            PositionY = pos.PositionY,
            PositionZ = pos.PositionZ,
            RotationY = pos.RotationY,
            UpdatedAt = pos.UpdatedAt
        }, "Lưu vị trí thành công.");
    }
}