using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;

namespace Interact3D.DTOs.Model;

public class UploadModelDto
{
    [Required(ErrorMessage = "Vui lòng nhập tên model")]
    [MaxLength(200, ErrorMessage = "Tên model tối đa 200 ký tự")]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [Required(ErrorMessage = "Vui lòng chọn file 3D (.glb, .fbx)")]
    public IFormFile File { get; set; } = null!;

    public IFormFile? Thumbnail { get; set; }

    public string? BoneStandard { get; set; } = "None"; // "Mixamo", "Generic", "None"

    public bool HasAnimation { get; set; } = false;

    public bool IsPublic { get; set; } = true;
}